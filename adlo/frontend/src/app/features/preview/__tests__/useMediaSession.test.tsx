import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';
import type { MediaSessionBridge, MediaSessionCommand } from '@shared/ipc/mediaSession';
import { resetSystemMediaSession } from '../../media-session/systemMediaSession';
import { useMediaSession } from '../useMediaSession';

interface FakeSession {
  metadata: unknown;
  setActionHandler: ReturnType<typeof vi.fn>;
  setPositionState: ReturnType<typeof vi.fn>;
}

function installMediaSession(): FakeSession {
  const session: FakeSession = {
    metadata: null,
    setActionHandler: vi.fn(),
    setPositionState: vi.fn(),
  };
  Object.defineProperty(window.navigator, 'mediaSession', {
    value: session,
    configurable: true,
  });
  vi.stubGlobal(
    'MediaMetadata',
    class {
      title: string;
      constructor(init: { title: string }) {
        this.title = init.title;
      }
    },
  );
  return session;
}

function Probe({ title }: { title: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useMediaSession(ref, { title }, true);
  return <audio ref={ref} data-testid="probe-audio" />;
}

afterEach(() => {
  resetSystemMediaSession();
  Reflect.deleteProperty(window.navigator, 'mediaSession');
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'digitalLife');
  vi.unstubAllGlobals();
});

describe('useMediaSession（Windows 系统媒体卡片）', () => {
  it('publishes the title and wires transport actions to the element', () => {
    const session = installMediaSession();
    render(<Probe title="04-m4a-歌曲（AAC）" />);

    // 只写标题：用户要求卡片不显示副标题。
    expect(session.metadata).toEqual({ title: '04-m4a-歌曲（AAC）' });
    const actions = session.setActionHandler.mock.calls.map(([action]) => action);
    expect(actions).toEqual(
      expect.arrayContaining(['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto']),
    );

    const audio = document.querySelector('audio') as HTMLAudioElement;
    const play = vi.spyOn(audio, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(audio, 'pause').mockImplementation(() => undefined);

    const handlerFor = (name: string) =>
      session.setActionHandler.mock.calls.find(([action]) => action === name)?.[1] as
        | ((details: { seekOffset?: number; seekTime?: number }) => void)
        | undefined;

    handlerFor('play')?.({});
    expect(play).toHaveBeenCalled();
    handlerFor('pause')?.({});
    expect(pause).toHaveBeenCalled();

    // 快进/快退必须落在真实元素的 currentTime 上（duration 未知时不夹取）。
    audio.currentTime = 5;
    handlerFor('seekforward')?.({ seekOffset: 10 });
    expect(audio.currentTime).toBe(15);
    handlerFor('seekbackward')?.({ seekOffset: 12 });
    expect(audio.currentTime).toBe(3);
    handlerFor('seekto')?.({ seekTime: 2 });
    expect(audio.currentTime).toBe(2);
  });

  it('clears handlers and metadata on unmount so the card disappears', () => {
    const session = installMediaSession();
    const { unmount } = render(<Probe title="clip" />);
    unmount();

    expect(session.metadata).toBeNull();
    const cleared = session.setActionHandler.mock.calls.filter(([, handler]) => handler === null);
    expect(cleared.length).toBeGreaterThan(0);
  });

  it('is a no-op when the environment has no Media Session support', () => {
    // 不安装 navigator.mediaSession：hook 必须安静跳过（jsdom / 旧 WebView）。
    expect(() => render(<Probe title="clip" />)).not.toThrow();
  });
});

/** 桌面路径：Rust SMTC（`window.digitalLife.mediaSession.supported === true`）。 */
function installDesktopBridge() {
  let commandListener: ((command: MediaSessionCommand) => void) | undefined;
  const bridge = {
    supported: true,
    update: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    onCommand: (listener: (command: MediaSessionCommand) => void) => {
      commandListener = listener;
      return () => {
        commandListener = undefined;
      };
    },
  };
  (window as unknown as { digitalLife: { mediaSession: MediaSessionBridge } }).digitalLife = {
    mediaSession: bridge,
  };
  return {
    bridge,
    emit: (command: MediaSessionCommand) => commandListener?.(command),
  };
}

describe('useMediaSession 桌面路径（Rust SMTC）', () => {
  it('播放后推送快照，系统卡片按钮回放到真实元素', () => {
    const { bridge, emit } = installDesktopBridge();
    render(<Probe title="01-mp3-音乐" />);
    const audio = document.querySelector('audio') as HTMLAudioElement;

    // 尚未开始播放：不弹卡片（与 Chromium 默认行为一致）。
    expect(bridge.update).not.toHaveBeenCalled();

    audio.dispatchEvent(new Event('play'));
    expect(bridge.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: '01-mp3-音乐', status: 'playing' }),
    );

    const play = vi.spyOn(audio, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
    emit('play');
    expect(play).toHaveBeenCalled();
    emit('pause');
    expect(pause).toHaveBeenCalled();

    // 停止：暂停 + 归零 + 卡片关闭。
    emit('stop');
    expect(audio.currentTime).toBe(0);
    expect(bridge.clear).toHaveBeenCalled();
  });

  it('进度按秒节流推送，卸载时关闭卡片', () => {
    const { bridge } = installDesktopBridge();
    const { unmount } = render(<Probe title="clip" />);
    const audio = document.querySelector('audio') as HTMLAudioElement;

    audio.dispatchEvent(new Event('play'));
    bridge.update.mockClear();

    audio.currentTime = 0.4;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(bridge.update).not.toHaveBeenCalled();

    audio.currentTime = 3;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(bridge.update).toHaveBeenCalledWith(expect.objectContaining({ positionMs: 3000 }));

    unmount();
    expect(bridge.clear).toHaveBeenCalled();
  });

  it('播放结束即关闭卡片', () => {
    const { bridge } = installDesktopBridge();
    render(<Probe title="clip" />);
    const audio = document.querySelector('audio') as HTMLAudioElement;

    audio.dispatchEvent(new Event('play'));
    audio.dispatchEvent(new Event('ended'));
    expect(bridge.clear).toHaveBeenCalled();
  });
});
