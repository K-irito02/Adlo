import type { IpcError, IpcResult } from '@ai-digital-life/kernel';
import type { DownloadSettings } from '@shared/ipc/download';
import type {
  StoragePathPatch,
  StoragePreflight,
  StorageStatus,
  TreeCacheStats,
} from '@shared/ipc/storage';
import { resetDownloadPathToDefault } from './downloadPathReset';
import type { DownloadPathResetDeps, GroupResetResult } from './types';

/** 仅声明本模块用到的成员，避免依赖完整 bridge 类型。 */
export interface StorageBridgeLike {
  preflight(patch: StoragePathPatch): Promise<IpcResult<StoragePreflight>>;
}

export type StorageTreeBlock = 'full' | 'reenable' | 'ttl' | 'hidden';
export type StorageDownloadBlock = 'on' | 'off' | 'switchOnly' | 'hidden';

export interface StorageResetBlocks {
  coreNeeded: boolean;
  tree: StorageTreeBlock;
  budget: boolean;
  download: StorageDownloadBlock;
}

export interface StorageResetPlan {
  blocks: StorageResetBlocks;
  preflight: StoragePreflight | null;
  /** 计划生成时刻的下载迁移开关（程序化流程无对话框快照，取实时值）。 */
  migrateAtOpen: boolean;
}

/**
 * 存储恢复计划的计算结果（判别联合，供对话框区分「无事可做」与「不可用」）：
 * - `ready`：得到可执行计划；
 * - `allDefault`：四块均已默认，存储无事可做（正常跳过）；
 * - `unavailable`：无桥 / 状态不可读 / 核心预检 IPC 调用失败（无法判定）。
 */
export type StorageResetPlanResult =
  | { status: 'ready'; plan: StorageResetPlan }
  | { status: 'allDefault' }
  | { status: 'unavailable' };

export interface StorageResetDeps {
  bridge?: StorageBridgeLike;
  refreshStatus: () => Promise<StorageStatus | null>;
  setPaths: (
    patch: StoragePathPatch,
    applyNow: boolean,
  ) => Promise<
    | { ok: true; restartRequired: boolean; preflight: StoragePreflight }
    | { ok: false; error: IpcError }
  >;
  resetBudget: () => Promise<boolean>;
  resetTreeCache: () => Promise<boolean>;
  previewDownload: () => { settings: DownloadSettings; loaded: boolean };
  /** 传入当前 tree 统计与预算（由调用方从 store/缓存读取）。 */
  readTreeStats: () => TreeCacheStats | null;
  readBudgetBytes: () => number | undefined;
  /** 下载分支执行用的纯序列依赖（由调用方注入 store action）。 */
  downloadPath: DownloadPathResetDeps;
}

/** 与 UI 同源的默认判定（避免在 shared 内重复常量：这些 helper 由调用方注入）。 */
export interface StorageResetPredicates {
  isCorePathsAtDefault: (status: StorageStatus | null, draftsDirty: boolean) => boolean;
  isTreeCacheAtDefault: (treeStats: TreeCacheStats | null) => boolean;
  isBudgetAtDefault: (budgetBytes: number | undefined) => boolean;
  treeBlockOf: (treeStats: TreeCacheStats | null) => StorageTreeBlock;
  downloadBlockOf: (settings: DownloadSettings, loaded: boolean) => StorageDownloadBlock;
}

const CORE_RESET_PATCH: StoragePathPatch = {
  mode: 'unified',
  root: '',
  categories: {},
  retainSource: false,
};

/**
 * 计算「恢复存储默认」的四块计划，返回判别结果：
 * - `unavailable`：无桥、状态不可用、或核心预检 IPC 调用失败；
 * - `allDefault`：四块均已默认（存储无事可做）；
 * - `ready`：返回计划；核心预检 IPC 成功但 `data.ok === false`（目标不可写等）仍返回计划，
 *   供对话框展示错误并禁用确认键。
 */
export async function computeStorageResetPlan(
  deps: StorageResetDeps,
  predicates: StorageResetPredicates,
): Promise<StorageResetPlanResult> {
  if (!deps.bridge) {
    return { status: 'unavailable' };
  }
  const status = await deps.refreshStatus();
  if (status === null) {
    return { status: 'unavailable' };
  }
  const download = deps.previewDownload();
  const treeStats = deps.readTreeStats();
  const coreNeeded = !predicates.isCorePathsAtDefault(status, false);
  const treeBlock = predicates.treeBlockOf(treeStats);
  const budgetBlock = !predicates.isBudgetAtDefault(deps.readBudgetBytes());
  const downloadBlock = predicates.downloadBlockOf(download.settings, download.loaded);
  if (
    !coreNeeded &&
    predicates.isTreeCacheAtDefault(treeStats) &&
    !budgetBlock &&
    downloadBlock === 'hidden'
  ) {
    return { status: 'allDefault' };
  }
  const blocks: StorageResetBlocks = {
    coreNeeded,
    tree: treeBlock,
    budget: budgetBlock,
    download: downloadBlock,
  };
  const migrateAtOpen = download.settings.auto_migrate_on_path_change;
  if (!coreNeeded) {
    return { status: 'ready', plan: { blocks, preflight: null, migrateAtOpen } };
  }
  const preflight = await deps.bridge.preflight(CORE_RESET_PATCH);
  if (!preflight.ok) {
    return { status: 'unavailable' };
  }
  return { status: 'ready', plan: { blocks, preflight: preflight.data, migrateAtOpen } };
}

/**
 * 按计划顺序执行四块恢复：核心路径 → 预算 → 树缓存 → 下载路径。
 * 核心块失败即早返（其后三块不可逆且互不阻塞，全部尝试——组级「一次聚合失败」语义）；
 * 非核心块首个失败决定整体 `failedStep`（沿用组级行为，不短路后续块）；`restartRequired`
 * 透传核心块结果。下载块自身结果另经 `downloadFailure` 暴露：调用方据此在预算/树亦失败时
 * 仍能复现下载族失败文案（R6/R9），无需从 `failedStep`（首个失败块）反推。
 */
export async function executeStorageResetPlan(
  deps: StorageResetDeps,
  plan: StorageResetPlan,
  opts: { applyNow: boolean; retainSource: boolean },
): Promise<{
  result: GroupResetResult;
  restartRequired: boolean;
  downloadFailure?: Extract<GroupResetResult, { ok: false }>;
}> {
  const core = await applyCoreReset(deps, plan, opts);
  if (!core.result.ok) {
    return core;
  }
  // 收集失败块的完整结果：下载块是唯一携带 `error` 的块，调用方需其 `failedStep`+`error`
  // 复现下载族失败文案（R6）。
  const failures: GroupResetResult[] = [];
  if (plan.blocks.budget && !(await deps.resetBudget())) {
    failures.push({ ok: false, failedStep: 'budget' });
  }
  if (plan.blocks.tree !== 'hidden' && !(await deps.resetTreeCache())) {
    failures.push({ ok: false, failedStep: 'treeCache' });
  }
  const download =
    plan.blocks.download === 'hidden'
      ? null
      : await resetDownloadPathToDefault(deps.downloadPath, plan.migrateAtOpen);
  const downloadFailure = download !== null && !download.ok ? download : undefined;
  if (downloadFailure) {
    failures.push(downloadFailure);
  }
  return {
    result: failures.length > 0 ? failures[0] : { ok: true },
    restartRequired: core.restartRequired,
    downloadFailure,
  };
}

/** 核心路径块（先行）：失败即早返；成功带出 `restartRequired`（无需重赋值）。 */
async function applyCoreReset(
  deps: StorageResetDeps,
  plan: StorageResetPlan,
  opts: { applyNow: boolean; retainSource: boolean },
): Promise<{ result: GroupResetResult; restartRequired: boolean }> {
  if (!plan.blocks.coreNeeded) {
    return { result: { ok: true }, restartRequired: false };
  }
  const applied = await deps.setPaths(
    { ...CORE_RESET_PATCH, retainSource: opts.retainSource },
    opts.applyNow,
  );
  if (!applied.ok) {
    return {
      result: { ok: false, failedStep: 'corePaths', error: applied.error },
      restartRequired: false,
    };
  }
  if (!applied.preflight.ok) {
    return { result: { ok: false, failedStep: 'corePathsPreflight' }, restartRequired: false };
  }
  return { result: { ok: true }, restartRequired: applied.restartRequired };
}
