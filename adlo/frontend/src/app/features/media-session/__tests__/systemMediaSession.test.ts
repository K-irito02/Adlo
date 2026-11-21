import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MediaSessionBridge,
  MediaSessionCommand,
  MediaSessionNowPlaying,
} from '@shared/ipc/mediaSession';
import {
  currentMediaSessionSource,
  onMediaSessionCommand,
  resetSystemMediaSession,
  setMediaSessionSource,
} from '../systemMediaSession';

interface Harness {
  bridge: {
    supported: boolean;
    update: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    onCommand: (listener: (command: MediaSessionCommand) => void) => () => void;
  };
  emit: (command: MediaSessionCommand) => void;
}

function installBridge(): Harness {
  let listener: ((command: MediaSessionCommand) => void) | undefined;
  const bridge = {
    supported: true,
    update: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    onCommand: (next: (command: MediaSessionCommand) => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
  };
  (window as unknown as { digitalLife: { mediaSession: MediaSessionBridge } }).digitalLife = {
    mediaSession: bridge,
  };
  return { bridge, emit: (command) => listener?.(command) };
}

function claim(title: string, status: 'playing' | 'paused'): MediaSessionNowPlaying {
  return { title, status, positionMs: 0, durationMs: 100_000 };
}

/** 每秒推进时间并刷新心跳（模拟真实快照频率，避免被过期规则清掉）。 */
function advanceWithHeartbeat(ms: number, refresh: () => void): void {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    vi.advanceTimersByTime(1000);
    refresh();
  }
}

beforeEach(() => {
  resetSystemMediaSession();
  vi.useFakeTimers();
});

afterEach(() => {
  resetSystemMediaSession();
  vi.useRealTimers();
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'digitalLife');
});

describe('systemMediaSession 归属与轮播', () => {
  it('单一播放源直接显示；暂停源只在没有播放源时显示', () => {
    const { bridge } = installBridge();

    setMediaSessionSource('tab:a', claim('A', 'playing'));
    expect(bridge.update).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'A' }));
    expect(currentMediaSessionSource()).toBe('tab:a');

    setMediaSessionSource('tab:a', claim('A', 'paused'));
    expect(bridge.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'A', status: 'paused' }),
    );

    setMediaSessionSource('tab:b', claim('B', 'playing'));
    expect(bridge.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'B', status: 'playing' }),
    );
    expect(currentMediaSessionSource()).toBe('tab:b');
  });

  it('多播放源按 3 秒轮播，快照刷新不会打断当前显示', () => {
    const { bridge } = installBridge();
    const refresh = () => {
      setMediaSessionSource('tab:a', claim('A', 'playing'));
      setMediaSessionSource('tab:b', claim('B', 'playing'));
    };
    refresh();
    expect(currentMediaSessionSource()).toBe('tab:a');
    expect(bridge.update).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'A' }));

    // 3 秒内保持 A（此前每个快照都会抢卡片，约 1s 一跳）。
    advanceWithHeartbeat(2_000, refresh);
    expect(currentMediaSessionSource()).toBe('tab:a');

    // 跨过 3 秒后轮到 B。
    advanceWithHeartbeat(1_000, refresh);
    expect(currentMediaSessionSource()).toBe('tab:b');

    // 再一个周期回到 A（回绕）。
    advanceWithHeartbeat(3_000, refresh);
    expect(currentMediaSessionSource()).toBe('tab:a');
  });

  it('本地预览与标签页同级：都会参与轮播', () => {
    const refresh = () => {
      setMediaSessionSource('preview', claim('本地文件', 'playing'));
      setMediaSessionSource('tab:a', claim('站点视频', 'playing'));
    };
    installBridge();
    refresh();
    expect(currentMediaSessionSource()).toBe('preview');

    advanceWithHeartbeat(3_000, refresh);
    expect(currentMediaSessionSource()).toBe('tab:a');

    advanceWithHeartbeat(3_000, refresh);
    expect(currentMediaSessionSource()).toBe('preview');
  });

  it('标签页播放源失去心跳后过期，卡片关闭', () => {
    const { bridge } = installBridge();
    setMediaSessionSource('tab:a', claim('A', 'playing'));
    expect(bridge.update).toHaveBeenCalled();

    // 不再上报：5 秒后过期（本地预览不受此限制）。
    vi.advanceTimersByTime(6_000);
    expect(bridge.clear).toHaveBeenCalled();
    expect(currentMediaSessionSource()).toBeNull();
  });

  it('暂停快照最长保留 5 分钟', () => {
    const { bridge } = installBridge();
    setMediaSessionSource('tab:a', claim('A', 'paused'));

    vi.advanceTimersByTime(4 * 60_000);
    expect(bridge.clear).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2 * 60_000);
    expect(bridge.clear).toHaveBeenCalled();
  });

  it('卡片按钮作用于当前显示的源', () => {
    const { emit } = installBridge();
    const preview = vi.fn();
    const browser = vi.fn();
    const offPreview = onMediaSessionCommand('preview', preview);
    const offBrowser = onMediaSessionCommand('browser', browser);

    setMediaSessionSource('tab:a', claim('A', 'playing'));
    emit('pause');
    expect(browser).toHaveBeenCalledWith('pause');
    expect(preview).not.toHaveBeenCalled();

    // 标签页停止占用后，本地预览成为唯一源并接管按钮。
    setMediaSessionSource('tab:a', null);
    setMediaSessionSource('preview', claim('本地文件', 'playing'));
    emit('play');
    expect(preview).toHaveBeenCalledWith('play');

    offPreview();
    offBrowser();
  });

  it('浏览器/预览模式（supported=false）下不向桥接下发布内容', () => {
    const update = vi.fn(async () => undefined);
    (window as unknown as { digitalLife: { mediaSession: MediaSessionBridge } }).digitalLife = {
      mediaSession: { supported: false, update, clear: vi.fn(), onCommand: () => () => undefined },
    };
    setMediaSessionSource('preview', claim('clip', 'playing'));
    expect(update).not.toHaveBeenCalled();
  });

  it('标题不变时同秒进度不重复下发', () => {
    const { bridge } = installBridge();
    const base = { title: 'clip', status: 'playing' as const, durationMs: 60_000 };

    setMediaSessionSource('preview', { ...base, positionMs: 4_200 });
    setMediaSessionSource('preview', { ...base, positionMs: 4_600 });
    expect(bridge.update).toHaveBeenCalledTimes(1);

    setMediaSessionSource('preview', { ...base, positionMs: 5_400 });
    expect(bridge.update).toHaveBeenCalledTimes(2);
  });
});
