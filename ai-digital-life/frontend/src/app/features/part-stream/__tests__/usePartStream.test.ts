import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePartStream } from '../usePartStream';
import { createPartStreamSlice } from '../../../stores/slices/partStreamSlice';
import type { PartStreamSlice } from '../../../stores/slices/partStreamSlice';
import { useAppStore } from '../../../stores/slicedStore';
import type { DigitalLifeBridge } from '../../../../shared/ipc/digital-life';
import type { IpcResult } from '../../../../kernel/errors';
import type { SessionMessagesPayload } from '../../../../kernel/types-part';
import type { SseWireEvent } from '../partStoreTypes';

function createStore() {
  let state: PartStreamSlice = {} as PartStreamSlice;
  const get = () => state;
  const set = (partial: any) => {
    if (typeof partial === 'function') {
      state = { ...state, ...partial(state) };
    } else {
      state = { ...state, ...partial };
    }
  };
  state = createPartStreamSlice(set as any, get as any);
  return { get, set };
}

describe('partStreamSlice', () => {
  it('applies SSE events and hydration', () => {
    const { get } = createStore();
    get().partHydrate('s1', { messages: [] });
    get().partApplyEvent('s1', { type: 'session.status', sessionID: 's1', status: 'busy' });
    expect(get().partBySession.s1?.status).toBe('busy');
  });
});

describe('usePartStream', () => {
  beforeEach(() => {
    useAppStore.setState({ partBySession: {} });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).digitalLife;
  });

  it('hydrates history then subscribes, unsubscribes on unmount', async () => {
    const getSessionMessages = vi.fn().mockResolvedValue({ ok: true, data: { messages: [] } });
    const unsub = vi.fn();
    const subscribe = vi.fn().mockReturnValue(unsub);
    const bridge = {
      conversation: { getSessionMessages },
      subscribeSessionPartEvents: subscribe,
    } as unknown as DigitalLifeBridge;
    (window as unknown as Record<string, unknown>).digitalLife = bridge;

    const { unmount } = renderHook(() => usePartStream('s1'));
    await waitFor(() => expect(getSessionMessages).toHaveBeenCalledWith('s1'));
    expect(subscribe).toHaveBeenCalled();
    unmount();
    expect(unsub).toHaveBeenCalled();
  });

  it('subscribes only after deferred hydrate resolves; late delta lands (regression: dropped deltas)', async () => {
    let resolveHydrate!: (res: IpcResult<SessionMessagesPayload | undefined>) => void;
    const getSessionMessages = vi.fn(
      () =>
        new Promise<IpcResult<SessionMessagesPayload | undefined>>((resolve) => {
          resolveHydrate = resolve;
        }),
    );
    const unsub = vi.fn();
    const subscribe = vi.fn().mockReturnValue(unsub);
    const bridge = {
      conversation: { getSessionMessages },
      subscribeSessionPartEvents: subscribe,
    } as unknown as DigitalLifeBridge;
    (window as unknown as Record<string, unknown>).digitalLife = bridge;

    const { unmount } = renderHook(() => usePartStream('s1'));
    await waitFor(() => expect(getSessionMessages).toHaveBeenCalledWith('s1'));

    // The EventSource must NOT be opened before history hydrate resolves: a
    // part delta arriving in that gap is otherwise applied to an empty store
    // and absent from the (older) hydrate snapshot → streamed text is lost.
    expect(subscribe).not.toHaveBeenCalled();

    resolveHydrate({
      ok: true,
      data: {
        messages: [
          {
            message: { id: 'm1', sessionID: 's1', role: 'assistant', timeCreated: 0 },
            parts: [
              {
                id: 'p1',
                messageID: 'm1',
                sessionID: 's1',
                type: 'text',
                ordinal: 0,
                timeCreated: 0,
                data: { type: 'text', text: 'hello' },
              },
            ],
          },
        ],
      },
    });

    await waitFor(() => expect(subscribe).toHaveBeenCalled());
    const listener = subscribe.mock.calls[0][0] as (event: SseWireEvent) => void;
    listener({
      type: 'message.part.delta',
      sessionID: 's1',
      messageID: 'm1',
      partID: 'p1',
      field: 'text',
      delta: ' world',
    });

    const part = useAppStore.getState().partBySession.s1?.partsByMessage.get('m1')?.[0];
    const text = part && 'text' in part.data ? (part.data as { text: string }).text : undefined;
    expect(text).toBe('hello world');
    unmount();
  });
});
