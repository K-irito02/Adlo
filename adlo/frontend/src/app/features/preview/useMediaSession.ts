import { useEffect, type RefObject } from 'react';

export interface MediaSessionMeta {
  /** 卡片主标题（文件名，不含扩展名）。 */
  title: string;
  /** 副标题（应用名）。 */
  artist: string;
}

/**
 * 把本地媒体预览接进 **Windows 系统媒体卡片**（SMTC）。
 *
 * 背景（事项 17）：WebView2 与 Edge 同源（Chromium），系统卡片能显示的“歌名/封面/上一首下一首”
 * 全部来自页面的 **Media Session API**。浏览器里的网站（抖音等）自己设置了 metadata，
 * 所以 Edge 卡片有信息；我们的本地预览此前只播放元素、不设 metadata，卡片只剩页面标题。
 *
 * 这里按 Media Session 标准补齐：
 * - `metadata`：标题 = 文件名，artist = 应用名；
 * - 动作映射：播放/暂停/停止/快退/快进/跳转 → 真实元素；
 * - `setPositionState`：让卡片进度条跟随（时长未知时不设，避免抛错）。
 *
 * 只对**本地媒体预览**生效；浏览器标签里的音频由站点自己的 Media Session 负责。
 */
export function useMediaSession(
  mediaRef: RefObject<HTMLMediaElement | null>,
  meta: MediaSessionMeta,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return undefined;
    }
    const session = navigator.mediaSession;
    const media = mediaRef.current;
    if (!media) {
      return undefined;
    }

    if (typeof MediaMetadata !== 'undefined') {
      session.metadata = new MediaMetadata({ title: meta.title, artist: meta.artist });
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
  }, [enabled, mediaRef, meta.title, meta.artist]);
}
