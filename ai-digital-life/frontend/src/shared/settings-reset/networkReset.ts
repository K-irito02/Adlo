import type { DshSourceConfig } from '@shared/ipc/dsh';
import type { GroupResetResult } from './types';

/** 官方 npm registry 地址（DSH 下载源「官方」选项与恢复默认共用，单一事实来源）。 */
export const NPMJS_URL = 'https://registry.npmjs.org';

/**
 * Network 组恢复默认的目标配置（源/代理部分，与 NetworkSettings 组级恢复同源）：
 * 源→自动检测、代理→自动、清空自定义地址与代理字段；无下载无安装。
 * 由旧 `dshReset.ts` 的完整载荷拆出（`version_source` 留归 dsh，避免 ResetAll 重复执行）。
 */
export const NETWORK_RESET_PAYLOAD: DshSourceConfig = {
  source_mode: 'auto',
  npm_registry: NPMJS_URL,
  proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
};

export interface NetworkResetDeps {
  saveSourceConfig: (config: DshSourceConfig) => Promise<boolean>;
}

export async function executeNetworkResetPlan(deps: NetworkResetDeps): Promise<GroupResetResult> {
  const ok = await deps.saveSourceConfig(NETWORK_RESET_PAYLOAD);
  if (!ok) {
    return { ok: false, failedStep: 'saveSourceConfig' };
  }
  return { ok: true };
}
