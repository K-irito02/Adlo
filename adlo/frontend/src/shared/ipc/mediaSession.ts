/**
 * 系统媒体卡片（SMTC）桥接契约 —— 事项 17 路线 A。
 *
 * 背景：桌面端由 Rust 侧通过 `ISystemMediaTransportControlsInterop::GetForWindow` 自建会话
 * （界面上的「应用名 + 图标」来自本进程 AUMID `com.adlo.app`）；浏览器模式没有该能力，
 * 继续用标准 `navigator.mediaSession`，所以这里用 `supported` 区分两条实现路径。
 *
 * 实现：
 * - 桌面：`tauri-bridge/tauri-media-session.ts`（Tauri invoke + 事件订阅）
 * - 浏览器：`httpBridge` / `mock-bridge` 的 `supported: false` 空实现（hook 回落到
 *   `navigator.mediaSession`）
 */

export type MediaSessionPlaybackStatus = 'playing' | 'paused' | 'stopped';

/** 系统卡片上的按钮；上一首/下一首没有播放列表，不下发。 */
export type MediaSessionCommand = 'play' | 'pause' | 'stop';

export interface MediaSessionNowPlaying {
  /** 卡片主标题（本地预览取文件名，不含扩展名；标签页取站点/页面标题）。 */
  readonly title: string;
  readonly status: MediaSessionPlaybackStatus;
  /** 毫秒；未知时省略。 */
  readonly positionMs?: number;
  /** 毫秒；未知时省略。 */
  readonly durationMs?: number;
}

export interface MediaSessionBridge {
  /** 桌面端（Rust SMTC）为 true；浏览器/预览/mock 为 false。 */
  readonly supported: boolean;
  /** 推送「正在播放」快照（元数据只在曲目变化时真正重写，进度可高频推送）。 */
  update(nowPlaying: MediaSessionNowPlaying): Promise<void>;
  /** 关闭系统卡片（预览关闭 / 播放结束）。 */
  clear(): Promise<void>;
  /** 订阅系统卡片按钮；返回同步取消订阅函数。 */
  onCommand(listener: (command: MediaSessionCommand) => void): () => void;
}
