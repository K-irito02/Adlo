import { useEffect, type RefObject } from 'react';
import type { MediaSessionNowPlaying, MediaSessionPlaybackStatus } from '@shared/ipc/mediaSession';
import { onMediaSessionCommand, setMediaSessionSource } from '../media-session/systemMediaSession';

export interface MediaSessionMeta {
  /** 卡片主标题（本地预览取文件名，不含扩展名）。 */
  title: string;
}

/** 进度推送间隔：`timeupdate` 频率远高于系统卡片刷新需要。 */
const POSITION_SYNC_INTERVAL_MS = 1000;

/**
 * 把本地媒体预览接进系统媒体卡片。
 *
 * 两条实现路径（事项 17）：
 * - **桌面（Tauri）**：WebView2 的 Chromium 媒体会话归属 `msedgewebview2.exe`，系统卡片恒显示
 *   「未知应用」且没有图标，宿主的进程/窗口 AUMID 都改不掉它。因此启动参数关掉了 Chromium 的
 *   `MediaSessionService`，改由 Rust 侧自建 SMTC 会话（`commands::media_session`，身份 =
 *   `com.adlo.app`）。这里通过 `window.digitalLife.mediaSession` 推快照、收按钮事件。
 * - **浏览器**：没有 Rust 后端，继续用标准 Media Session API（`metadata` + action handlers +
 *   `setPositionState`），行为与改造前一致。
 *
 * 只对**本地媒体预览**生效；内置浏览器标签页由 `useBrowserSystemMedia` 镜像进同一张卡片
 * （`systemMediaSession` 负责多源轮播，本地预览与标签页同级、无优先级）。
 */
export function useMediaSession(
  mediaRef: RefObject<HTMLMediaElement | null>,
  meta: MediaSessionMeta,
  enabled: boolean,
): void {
  const { title } = meta;
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const media = mediaRef.current;
    if (!media) {
      return undefined;
    }

    const bridge = window.digitalLife?.mediaSession;
    if (bridge?.supported) {
      return attachDesktopSession(media, { title });
    }
    return attachBrowserSession(media, { title });
  }, [enabled, mediaRef, title]);
}

/** 桌面路径：快照交给归属仲裁推给 Rust SMTC，卡片按钮回放到真实媒体元素。 */
function attachDesktopSession(media: HTMLMediaElement, meta: MediaSessionMeta): () => void {
  const snapshot = (status: MediaSessionPlaybackStatus): MediaSessionNowPlaying => {
    const position = media.currentTime;
    const duration = media.duration;
    return {
      title: meta.title,
      status,
      positionMs: Number.isFinite(position) ? Math.max(0, position) * 1000 : undefined,
      durationMs: Number.isFinite(duration) && duration > 0 ? duration * 1000 : undefined,
    };
  };
  const push = (status: MediaSessionPlaybackStatus) => {
    setMediaSessionSource('preview', snapshot(status));
  };
  const release = () => {
    setMediaSessionSource('preview', null);
  };

  // 与 Chromium 的默认行为对齐：只有真正开始播放后才让卡片出现，
  // 避免「刚点开文件、还没播」就弹出一条已暂停的卡片。
  if (!media.paused) {
    push('playing');
  }

  let lastPositionMs = media.currentTime * 1000;
  const onPlay = () => push('playing');
  const onPause = () => push('paused');
  const onEnded = release;
  const onTimeUpdate = () => {
    const positionMs = (Number.isFinite(media.currentTime) ? media.currentTime : 0) * 1000;
    if (positionMs - lastPositionMs < POSITION_SYNC_INTERVAL_MS) {
      return;
    }
    lastPositionMs = positionMs;
    push(media.paused ? 'paused' : 'playing');
  };

  media.addEventListener('play', onPlay);
  media.addEventListener('pause', onPause);
  media.addEventListener('ended', onEnded);
  media.addEventListener('timeupdate', onTimeUpdate);

  const unsubscribe = onMediaSessionCommand('preview', (command) => {
    switch (command) {
      case 'play':
        void media.play().catch(() => undefined);
        break;
      case 'pause':
        media.pause();
        break;
      case 'stop':
        media.pause();
        media.currentTime = 0;
        release();
        break;
    }
  });

  return () => {
    media.removeEventListener('play', onPlay);
    media.removeEventListener('pause', onPause);
    media.removeEventListener('ended', onEnded);
    media.removeEventListener('timeupdate', onTimeUpdate);
    unsubscribe();
    release();
  };
}

/** 浏览器路径：标准 Media Session API（与改造前行为一致）。 */
function attachBrowserSession(media: HTMLMediaElement, meta: MediaSessionMeta): () => void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return () => undefined;
  }
  const session = navigator.mediaSession;

  if (typeof MediaMetadata !== 'undefined') {
    session.metadata = new MediaMetadata({ title: meta.title });
  }

  const seekBy = (delta: number) => {
    const target = media.currentTime + delta;
    media.currentTime = Math.min(
      Math.max(0, target),
      Number.isFinite(media.duration) ? media.duration : target,
    );
  };
  const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
    ['play', () => void media.play().catch(() => undefined)],
    ['pause', () => media.pause()],
    [
      'stop',
      () => {
        media.pause();
        media.currentTime = 0;
      },
    ],
    ['seekbackward', (details) => seekBy(-(details.seekOffset ?? 10))],
    ['seekforward', (details) => seekBy(details.seekOffset ?? 10)],
    [
      'seekto',
      (details) => {
        if (typeof details.seekTime === 'number') {
          media.currentTime = details.seekTime;
        }
      },
    ],
  ];
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      /* 浏览器未实现该 action：忽略即可 */
    }
  }

  const syncPosition = () => {
    if (typeof session.setPositionState !== 'function') {
      return;
    }
    const duration = media.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }
    try {
      session.setPositionState({
        duration,
        position: Math.min(media.currentTime, duration),
        playbackRate: media.playbackRate || 1,
      });
    } catch {
      /* 位置状态非法（eslint 外的运行期边界）：忽略 */
    }
  };
  media.addEventListener('timeupdate', syncPosition);
  media.addEventListener('durationchange', syncPosition);
  media.addEventListener('play', syncPosition);
  syncPosition();

  return () => {
    media.removeEventListener('timeupdate', syncPosition);
    media.removeEventListener('durationchange', syncPosition);
    media.removeEventListener('play', syncPosition);
    for (const [action] of handlers) {
      try {
        session.setActionHandler(action, null);
      } catch {
        /* ignore */
      }
    }
    session.metadata = null;
  };
}
