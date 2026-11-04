import type { GroupResetResult } from './types';

/**
 * OpenCode CLI 组恢复默认的目标配置：版本来源=自动检测 + 新终端窗口默认自动启用。
 * 与 OpencodeSettings 组级恢复（侧边栏「恢复 OpenCode CLI 全部默认」）同源；
 * 本模块不 import stores，桥调用由调用方经 deps 注入。
 */
export interface OpencodeResetDeps {
  saveVersionSource: (mode: 'auto') => Promise<boolean>;
  setTerminalInjection: (enabled: boolean) => Promise<boolean>;
}

export async function executeOpencodeResetPlan(deps: OpencodeResetDeps): Promise<GroupResetResult> {
  const sourceOk = await deps.saveVersionSource('auto');
  if (!sourceOk) {
    return { ok: false, failedStep: 'saveSourceConfig' };
  }
  const terminalOk = await deps.setTerminalInjection(true);
  if (!terminalOk) {
    return { ok: false, failedStep: 'terminalInjection' };
  }
  return { ok: true };
}
