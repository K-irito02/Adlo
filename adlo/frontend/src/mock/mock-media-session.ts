import type { MediaSessionBridge } from '../shared/ipc/mediaSession';

/**
 * 浏览器 / 预览 / mock 的系统媒体卡片实现：没有 Rust SMTC。
 *
 * `supported: false` 让 `useMediaSession` 回落到标准 `navigator.mediaSession`
 * （浏览器模式下卡片本来就能正常显示站点/页面元数据）。
 */
export const mockMediaSession: MediaSessionBridge = {
  supported: false,
  update: async () => undefined,
  clear: async () => undefined,
  onCommand: () => () => undefined,
};
