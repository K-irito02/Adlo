import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserMediaStatePayload } from '@shared/ipc/browser';
import type { MediaSessionCommand } from '@shared/ipc/mediaSession';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserTypes';
import {
  currentMediaSessionSource,
  resetSystemMediaSession,
} from '../../media-session/systemMediaSession';
import { useBrowserSystemMedia } from '../useBrowserSystemMedia';

const TAB: BrowserTabState = {
  id: 'tab-1',
  workspaceId: 'ws',
  title: '站点标题',
  url: 'https://www.bilibili.com/video/BV1xx',
  titleResolved: true,
  isPinned: false,
  sortOrder: 0,
  isPlayingAudio: true,
  isAudioMuted: false,
  isDownloading: false,
};

interface Harness {
  update: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  mediaControlTab: ReturnType<typeof vi.fn>;
  emitState: (payload: BrowserMediaStatePayload) => void;
  emitCommand: (command: MediaSessionCommand) => void;
}

function install(): Harness {
  let stateListener: ((payload: BrowserMediaStatePayload) => void) | undefined;
  let commandListener: ((command: MediaSessionCommand) => void) | undefined;
  const update = vi.fn(async () => undefined);
  const clear = vi.fn(async () => undefined);
  const mediaControlTab = vi.fn(async () => undefined);
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    mediaSession: {
      supported: true,
      update,
      clear,
      onCommand: (listener: (command: MediaSessionCommand) => void) => {
        commandListener = listener;
        return () => {
          commandListener = undefined;
        };
      },
    },
    browser: {
      onMediaStateChanged: (listener: (payload: BrowserMediaStatePayload) => void) => {
        stateListener = listener;
        return () => {
          stateListener = undefined;
        };
      },
      mediaControlTab,
    },
  };
  return {
    update,
    clear,
    mediaControlTab,
    emitState: (payload) =>
      act(() => {
        stateListener?.(payload);
      }),
    emitCommand: (command) =>
      act(() => {
        commandListener?.(command);
      }),
  };
}

function state(overrides: Partial<BrowserMediaStatePayload>): BrowserMediaStatePayload {
  return {
    tabId: 'tab-1',
    title: '',
    artist: '',
    album: '',
    paused: false,
    ended: false,
    position: 0,
    duration: 0,
    ...overrides,
  };
}

beforeEach(() => {
  resetSystemMediaSession();
  useAppStore.setState({ browserTabs: [TAB] });
});

afterEach(() => {
  resetSystemMediaSession();
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'digitalLife');
});

describe('useBrowserSystemMedia（标签页 → 系统卡片镜像）', () => {
  it('优先使用站点 mediaSession 标题，并带上进度；不发送副标题', () => {
    const harness = install();
    const { unmount } = renderHook(() => useBrowserSystemMedia());

    harness.emitState(state({ title: '视频标题', artist: 'UP 主', position: 12.5, duration: 200 }));

    expect(harness.update).toHaveBeenLastCalledWith({
      title: '视频标题',
      status: 'playing',
      positionMs: 12_500,
      durationMs: 200_000,
    });
    expect(currentMediaSessionSource()).toBe('tab:tab-1');
    unmount();
  });

  it('站点没有元数据时回退标签标题', () => {
    const harness = install();
    const { unmount } = renderHook(() => useBrowserSystemMedia());

    harness.emitState(state({ position: 3, duration: 10 }));

    expect(harness.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: '站点标题', status: 'playing' }),
    );
    unmount();
  });

  it('暂停显示 paused，播放结束释放卡片', () => {
    const harness = install();
    const { unmount } = renderHook(() => useBrowserSystemMedia());

    harness.emitState(state({ title: '视频标题', paused: true, position: 30, duration: 200 }));
    expect(harness.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: '视频标题', status: 'paused' }),
    );

    harness.emitState(
      state({ title: '视频标题', paused: true, ended: true, position: 200, duration: 200 }),
    );
    expect(harness.clear).toHaveBeenCalled();
    unmount();
  });

  it('标签关闭后释放卡片', () => {
    const harness = install();
    const { unmount } = renderHook(() => useBrowserSystemMedia());

    harness.emitState(state({ title: '视频标题', position: 5, duration: 100 }));
    expect(harness.update).toHaveBeenCalled();

    act(() => {
      useAppStore.setState({ browserTabs: [] });
    });
    expect(harness.clear).toHaveBeenCalled();
    unmount();
  });

  it('卡片按钮下发到当前显示的标签页', () => {
    const harness = install();
    const { unmount } = renderHook(() => useBrowserSystemMedia());

    harness.emitState(state({ title: '视频标题', position: 5, duration: 100 }));
    harness.emitCommand('pause');
    expect(harness.mediaControlTab).toHaveBeenCalledWith('tab-1', 'pause');

    harness.emitCommand('play');
    expect(harness.mediaControlTab).toHaveBeenCalledWith('tab-1', 'play');
    unmount();
  });

  it('浏览器模式（supported=false）完全不接管卡片', () => {
    const update = vi.fn(async () => undefined);
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      mediaSession: {
        supported: false,
        update,
        clear: vi.fn(async () => undefined),
        onCommand: () => () => {},
      },
      browser: { onMediaStateChanged: () => () => {}, mediaControlTab: vi.fn() },
    };
    const { unmount } = renderHook(() => useBrowserSystemMedia());
    unmount();
    expect(update).not.toHaveBeenCalled();
  });
});
