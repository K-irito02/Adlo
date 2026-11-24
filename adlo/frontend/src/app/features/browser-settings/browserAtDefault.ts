import {
  DEFAULT_BROWSER_SUSPEND_MS,
  DEFAULT_BROWSER_SUSPEND_WHITELIST,
  DEFAULT_BROWSER_SUSPEND_WHITELIST_ENABLED,
  DEFAULT_DOWNLOAD_MODE,
} from '@shared/defaultPreferences';
import type { AgentSiteAllowEntry } from '@shared/ipc-types.generated';
import type { DownloadSettings } from '@shared/ipc/download';
import { isDownloadPathAtDefault } from '../storage-settings/downloadPathReset';

/**
 * 浏览器组五块「全默认」聚合（挂起时长 + 挂起白名单 + 共享浏览配置文件 + 下载模式 + 下载路径）。
 *
 * 信息不足（config 未含挂起时长 / 白名单未知 / 下载设置未成功回读）返回 `null`（未知），
 * 消费方按「未知 → fail-open 启用」处理（不写或落 false 均不产生禁用）。
 * BrowserSettings（挂载实时判定，未知落 false）与 SettingsPanel（未激活时校正，
 * 事项 12c）共用此口径，防漂移。
 */
export function computeBrowserBlocksAtDefault(
  suspendMs: number | undefined,
  suspendWhitelistEnabled: boolean | undefined,
  suspendWhitelist: AgentSiteAllowEntry[] | undefined,
  shareProfile: boolean,
  downloadSettings: DownloadSettings,
  downloadSettingsLoaded: boolean,
): boolean | null {
  if (suspendMs === undefined || suspendWhitelistEnabled === undefined || !downloadSettingsLoaded) {
    return null;
  }
  return (
    suspendMs === DEFAULT_BROWSER_SUSPEND_MS &&
    suspendWhitelistEnabled === DEFAULT_BROWSER_SUSPEND_WHITELIST_ENABLED &&
    (suspendWhitelist ?? DEFAULT_BROWSER_SUSPEND_WHITELIST).length === 0 &&
    shareProfile === true &&
    downloadSettings.mode === DEFAULT_DOWNLOAD_MODE &&
    // 传变量而非字面量 true：与上方早返同义，但未来若删早返语义不变（Phase 4 R3-L9）。
    isDownloadPathAtDefault(downloadSettings, downloadSettingsLoaded)
  );
}
