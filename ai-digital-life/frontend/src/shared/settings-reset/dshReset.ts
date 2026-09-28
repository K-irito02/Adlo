import type { DshSourceConfig } from '@shared/ipc/dsh';
import type { GroupResetResult } from './types';

/** DSH 组恢复默认的目标配置（与 DshSettings 组级恢复同源）。 */
export const DSH_RESET_PAYLOAD: DshSourceConfig = {
  source_mode: 'auto',
  npm_registry: 'https://registry.npmjs.org',
  proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
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
