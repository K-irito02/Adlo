import type { AppPreferencePatch } from '@shared/ipc-types.generated';
import { getDefaultPreferences } from '@shared/defaultPreferences';
import {
  executeBrowserResetPlan,
  type BrowserResetDeps,
} from '@shared/settings-reset/browserReset';
import { executeDshResetPlan, type DshResetDeps } from '@shared/settings-reset/dshReset';
import {
  executeStorageResetPlan,
  type StorageResetDeps,
  type StorageResetPlan,
  type StorageResetPredicates,
} from '@shared/settings-reset/storageReset';
import type { GroupKey, GroupResetResult } from '@shared/settings-reset/types';

export interface ResetAllDeps {
  updatePreferences: (patch: AppPreferencePatch) => Promise<boolean>;
  browser: BrowserResetDeps;
  dsh: DshResetDeps;
  storage: StorageResetDeps;
  storagePredicates: StorageResetPredicates;
}

export interface ResetAllOutcome {
  done: GroupKey[];
  failedAt?: GroupKey;
  failedStep?: string;
  skipped: GroupKey[];
  restartRequired: boolean;
}

/** 先行的三组（存储组必须最后：其核心路径恢复可能触发文件迁移与重启）。 */
const FIRST_GROUPS = ['preferences', 'browser', 'dsh'] as const;
type FirstGroupKey = (typeof FIRST_GROUPS)[number];
const ORDER: GroupKey[] = [...FIRST_GROUPS, 'storage'];

const PREFERENCES_STEP = 'preferences';
const UNEXPECTED_STEP = 'unexpected';

/** 与 `IpcError` 结构等价（UI 层禁止直接 import kernel，故就地声明）。 */
interface NormalizedIpcError {
  code: string;
  message: string;
}

interface StepResult {
  result: GroupResetResult;
  restartRequired: boolean;
}

/** 抛出值若结构上就是 IPC 错误，则原样保留；否则丢弃（不伪造错误对象）。 */
function asIpcError(thrown: unknown): NormalizedIpcError | undefined {
  if (typeof thrown !== 'object' || thrown === null) {
    return undefined;
  }
  const candidate = thrown as { code?: unknown; message?: unknown };
  if (typeof candidate.code !== 'string' || typeof candidate.message !== 'string') {
    return undefined;
  }
  return { code: candidate.code, message: candidate.message };
}

/** 每一步统一兜底：注入的 action 抛出异常时映射为 'unexpected' 失败，编排器永不 reject。 */
async function attempt(run: () => Promise<StepResult>): Promise<StepResult> {
  try {
    return await run();
  } catch (thrown) {
    return {
      result: { ok: false, failedStep: UNEXPECTED_STEP, error: asIpcError(thrown) },
      restartRequired: false,
    };
  }
}

async function runPreferences(
  updatePreferences: ResetAllDeps['updatePreferences'],
): Promise<StepResult> {
  const ok = await updatePreferences(getDefaultPreferences());
  if (!ok) {
    return { result: { ok: false, failedStep: PREFERENCES_STEP }, restartRequired: false };
  }
  return { result: { ok: true }, restartRequired: false };
}

async function runFirstGroup(key: FirstGroupKey, deps: ResetAllDeps): Promise<StepResult> {
  if (key === 'preferences') {
    return runPreferences(deps.updatePreferences);
  }
  if (key === 'browser') {
    return { result: await executeBrowserResetPlan(deps.browser), restartRequired: false };
  }
  return { result: await executeDshResetPlan(deps.dsh), restartRequired: false };
}

async function runStorage(
  deps: StorageResetDeps,
  plan: StorageResetPlan,
  opts: { applyNow: boolean; retainSource: boolean },
): Promise<StepResult> {
  const out = await executeStorageResetPlan(deps, plan, opts);
  return { result: out.result, restartRequired: out.restartRequired };
}

/** 失败即停后仍未执行的组（不含失败组本身，也不含已成功的组）。 */
function pendingAfter(failedAt: GroupKey, done: GroupKey[]): GroupKey[] {
  return ORDER.filter((key) => key !== failedAt && !done.includes(key));
}

/**
 * 「恢复全部默认」编排：preferences → browser → dsh → storage（存储最后，
 * 因其可能触发文件迁移与重启）。任一失败即停，已成功的保留、未执行的计入 skipped；
 * 任一步抛出异常也会被收敛为 `failedStep: 'unexpected'` 的失败（本函数永不 reject）。
 * `storagePlan` 为 null 表示存储组无事可做或计划计算失败 → 跳过并计入 skipped。
 */
export async function resetAllSettings(
  deps: ResetAllDeps,
  opts: { storagePlan: StorageResetPlan | null; applyNow: boolean; retainSource: boolean },
  onProgress?: (key: GroupKey) => void,
): Promise<ResetAllOutcome> {
  const done: GroupKey[] = [];
  const plan = opts.storagePlan;

  for (const key of FIRST_GROUPS) {
    onProgress?.(key);
    const step = await attempt(() => runFirstGroup(key, deps));
    if (!step.result.ok) {
      return {
        done,
        failedAt: key,
        failedStep: step.result.failedStep,
        skipped: pendingAfter(key, done),
        restartRequired: step.restartRequired,
      };
    }
    done.push(key);
  }

  if (plan === null) {
    return { done, skipped: ['storage'], restartRequired: false };
  }

  onProgress?.('storage');
  const storageStep = await attempt(() =>
    runStorage(deps.storage, plan, { applyNow: opts.applyNow, retainSource: opts.retainSource }),
  );
  if (!storageStep.result.ok) {
    return {
      done,
      failedAt: 'storage',
      failedStep: storageStep.result.failedStep,
      skipped: pendingAfter('storage', done),
      restartRequired: storageStep.restartRequired,
    };
  }
  return { done: [...done, 'storage'], skipped: [], restartRequired: storageStep.restartRequired };
}
