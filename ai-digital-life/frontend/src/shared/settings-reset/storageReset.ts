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
 * 计算「恢复存储默认」的四块计划；无桥、状态不可用、或核心预检 IPC 失败时返回 null。
 * 核心预检成功但报错（`preflight.ok === false`）仍返回计划，供对话框展示错误并禁用确认键。
 */
export async function computeStorageResetPlan(
  deps: StorageResetDeps,
  predicates: StorageResetPredicates,
): Promise<StorageResetPlan | null> {
  if (!deps.bridge) {
    return null;
  }
  const status = await deps.refreshStatus();
  if (status === null) {
    return null;
  }
  const download = deps.previewDownload();
  const coreNeeded = !predicates.isCorePathsAtDefault(status, false);
  const treeBlock = predicates.treeBlockOf(deps.readTreeStats());
  const budgetBlock = !predicates.isBudgetAtDefault(deps.readBudgetBytes());
  const downloadBlock = predicates.downloadBlockOf(download.settings, download.loaded);
  if (!coreNeeded && treeBlock === 'hidden' && !budgetBlock && downloadBlock === 'hidden') {
    return null;
  }
  const blocks: StorageResetBlocks = {
    coreNeeded,
    tree: treeBlock,
    budget: budgetBlock,
    download: downloadBlock,
  };
  const migrateAtOpen = download.settings.auto_migrate_on_path_change;
  if (!coreNeeded) {
    return { blocks, preflight: null, migrateAtOpen };
  }
  const preflight = await deps.bridge.preflight(CORE_RESET_PATCH);
  if (!preflight.ok) {
    return null;
  }
  return { blocks, preflight: preflight.data, migrateAtOpen };
}

/**
 * 按计划顺序执行四块恢复：核心路径 → 预算 → 树缓存 → 下载路径。
 * 任一步失败即返回 `failedStep` 并短路后续块；`restartRequired` 透传核心块结果。
 */
export async function executeStorageResetPlan(
  deps: StorageResetDeps,
  plan: StorageResetPlan,
  opts: { applyNow: boolean; retainSource: boolean },
): Promise<{ result: GroupResetResult; restartRequired: boolean }> {
  let restartRequired = false;
  if (plan.blocks.coreNeeded) {
    const applied = await deps.setPaths(
      { ...CORE_RESET_PATCH, retainSource: opts.retainSource },
      opts.applyNow,
    );
    if (!applied.ok) {
      return {
        result: { ok: false, failedStep: 'corePaths', error: applied.error },
        restartRequired,
      };
    }
    if (!applied.preflight.ok) {
      return { result: { ok: false, failedStep: 'corePathsPreflight' }, restartRequired };
    }
    restartRequired = applied.restartRequired;
  }
  if (plan.blocks.budget && !(await deps.resetBudget())) {
    return { result: { ok: false, failedStep: 'budget' }, restartRequired };
  }
  if (plan.blocks.tree !== 'hidden' && !(await deps.resetTreeCache())) {
    return { result: { ok: false, failedStep: 'treeCache' }, restartRequired };
  }
  if (plan.blocks.download !== 'hidden') {
    const downloadResult = await resetDownloadPathToDefault(deps.downloadPath, plan.migrateAtOpen);
    if (!downloadResult.ok) {
      return { result: downloadResult, restartRequired };
    }
  }
  return { result: { ok: true }, restartRequired };
}
