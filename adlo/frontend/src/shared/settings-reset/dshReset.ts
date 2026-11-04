import type { DshSourceConfig } from '@shared/ipc/dsh';
import type { GroupResetResult } from './types';

/**
 * DSH 组恢复默认的目标配置（版本来源部分，与 DshSettings 组级恢复同源）。
 * 源/代理部分已拆归 `networkReset.ts`（Network 组）：ResetAll 先 dsh 后 network，
 * 此处只写版本来源，避免两腿重复执行。
 */
export const DSH_RESET_PAYLOAD: DshSourceConfig = {
  version_source: 'auto',
};

export interface DshResetDeps {
  saveSourceConfig: (config: DshSourceConfig) => Promise<boolean>;
}

export async function executeDshResetPlan(deps: DshResetDeps): Promise<GroupResetResult> {
  const ok = await deps.saveSourceConfig(DSH_RESET_PAYLOAD);
  if (!ok) {
    return { ok: false, failedStep: 'saveSourceConfig' };
  }
  return { ok: true };
}
