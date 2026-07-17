import type { AudioStatePayload } from '../shared/ipc/browser';

type StateListener = (payload: AudioStatePayload) => void;

export class BrowserAudioMonitor {
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  private playing = new Map<string, boolean>();
  private muted = new Map<string, boolean>();
  private iframes = new Map<string, HTMLIFrameElement | null>();
  private listeners = new Set<StateListener>();

  private notify(tabId: string, isPlaying: boolean, isMuted: boolean): void {
    for (const listener of this.listeners) {
      listener({ tabId, isPlaying, isMuted });
    }
  }

  startMonitoring(tabId: string, iframeEl: HTMLIFrameElement | null): void {
    this.iframes.set(tabId, iframeEl);
    const isMuted = this.muted.get(tabId) ?? false;

    const intervalId = setInterval(() => {
      try {
        const doc = iframeEl?.contentDocument ?? iframeEl?.contentWindow?.document;
        if (!doc) {
          if (this.playing.get(tabId)) {
            this.playing.set(tabId, false);
            this.notify(tabId, false, isMuted);
          }
          return;
        }
        const media = doc.querySelectorAll('audio, video');
        const nowPlaying = Array.from(media).some(
          (el) => !(el as HTMLMediaElement).paused && !(el as HTMLMediaElement).muted
        );
        const prevPlaying = this.playing.get(tabId) ?? false;
        if (nowPlaying !== prevPlaying) {
          this.playing.set(tabId, nowPlaying);
          this.notify(tabId, nowPlaying, isMuted);
        }
      } catch {
        // SecurityError: cross-origin iframe, skip auto-detection
      }
    }, 1000);

    this.intervals.set(tabId, intervalId);
  }

  stopMonitoring(tabId: string): void {
    const intervalId = this.intervals.get(tabId);
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      this.intervals.delete(tabId);
    }
    this.iframes.delete(tabId);
    this.playing.delete(tabId);
    this.muted.delete(tabId);
  }

  setMuted(tabId: string, muted: boolean): void {
    this.muted.set(tabId, muted);
    const iframeEl = this.iframes.get(tabId) ?? null;
    if (iframeEl) {
      try {
        const doc = iframeEl.contentDocument ?? iframeEl.contentWindow?.document;
        if (doc) {
          doc.querySelectorAll('audio, video').forEach((el) => {
            (el as HTMLMediaElement).muted = muted;
          });
        }
      } catch {
        // cross-origin: mute state is tracked locally but cannot be enforced
      }
    }
    for (const listener of this.listeners) {
      listener({ tabId, isMuted: muted });
    }
  }

  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    for (const tabId of this.intervals.keys()) {
      this.stopMonitoring(tabId);
    }
    this.listeners.clear();
  }
}
