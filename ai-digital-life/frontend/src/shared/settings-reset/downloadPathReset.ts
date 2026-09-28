import type { DownloadPathResetDeps, DownloadPathResetResult } from './types';

/**
 * 下载路径恢复默认的纯序列（单块 / 存储组级 / 浏览器组级 / 恢复全部共用）：
 * 路径写回系统默认（空串，migrate 由调用方给定快照）+ 开关复位关闭（解耦，成败都执行）。
 * 不 toast、不 import store —— 由调用方决定呈现。
 */
export async function resetDownloadPathToDefault(
  deps: DownloadPathResetDeps,
  migrate: boolean,
): Promise<DownloadPathResetResult> {
  const pathResult = await deps.changeDownloadPath('', migrate);
  // 开关独立复位：路径步失败也要执行，避免残留半关状态。
  const switchResult = await deps.updateDownloadSettings(undefined, undefined, false);
  if (!pathResult.ok) {
    return { ok: false, failedStep: 'downloadPath', error: pathResult.error };
  }
  if (!switchResult.ok) {
    return { ok: false, failedStep: 'downloadPathSwitch', error: switchResult.error };
  }
  return { ok: true };
}
