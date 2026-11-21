import type {
  MediaSessionBridge,
  MediaSessionCommand,
  MediaSessionNowPlaying,
} from '../shared/ipc/mediaSession';
import { invokeIpc, subscribeChannel } from './tauri-shared';

/**
 * 系统媒体卡片（Windows SMTC）的桌面实现 —— 事项 17 路线 A。
 *
 * 为什么不用 `navigator.mediaSession`：WebView2 的 Chromium 媒体会话归属
 * `msedgewebview2.exe`，系统卡片恒显示「未知应用」且没有图标（宿主 AUMID 改不掉）。
 * 现在启动参数关掉了 Chromium 的 `MediaSessionService`，改由 Rust 侧
 * `commands::media_session` 自建会话，因此这里走 Tauri invoke + 事件。
 *
 * 事件名与载荷由 Rust 侧定义：`digital-life://media-session-command` → `{ command }`。
 */
const MEDIA_SESSION_COMMAND_EVENT = 'digital-life://media-session-command';

export function createTauriMediaSessionBridge(): MediaSessionBridge {
  return {
    supported: true,
    update: async (nowPlaying: MediaSessionNowPlaying) => {
      // 系统卡片是「尽力而为」的装饰层：失败只影响卡片，不打断预览播放。
      await invokeIpc<boolean>('media_session_update', { nowPlaying });
    },
    clear: async () => {
      await invokeIpc<boolean>('media_session_clear');
    },
    onCommand: (listener: (command: MediaSessionCommand) => void) =>
      subscribeChannel<{ command: MediaSessionCommand }>(MEDIA_SESSION_COMMAND_EVENT, (payload) =>
        listener(payload.command),
      ),
  };
}
