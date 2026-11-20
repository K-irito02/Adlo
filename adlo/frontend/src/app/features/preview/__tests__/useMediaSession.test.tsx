import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';
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
      artist: string;
      constructor(init: { title: string; artist: string }) {
        this.title = init.title;
        this.artist = init.artist;
      }
    },
  );
  return session;
}

function Probe({ title, artist }: { title: string; artist: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useMediaSession(ref, { title, artist }, true);
  return <audio ref={ref} data-testid="probe-audio" />;
}

afterEach(() => {
  Reflect.deleteProperty(window.navigator, 'mediaSession');
  vi.unstubAllGlobals();
});

describe('useMediaSession（Windows 系统媒体卡片）', () => {
  it('publishes title/artist and wires transport actions to the element', () => {
    const session = installMediaSession();
    render(<Probe title="04-m4a-歌曲（AAC）" artist="Adlo" />);

    expect(session.metadata).toMatchObject({ title: '04-m4a-歌曲（AAC）', artist: 'Adlo' });
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
    const { unmount } = render(<Probe title="clip" artist="Adlo" />);
    unmount();

    expect(session.metadata).toBeNull();
    const cleared = session.setActionHandler.mock.calls.filter(([, handler]) => handler === null);
    expect(cleared.length).toBeGreaterThan(0);
  });

  it('is a no-op when the environment has no Media Session support', () => {
    // 不安装 navigator.mediaSession：hook 必须安静跳过（jsdom / 旧 WebView）。
    expect(() => render(<Probe title="clip" artist="Adlo" />)).not.toThrow();
  });
});
