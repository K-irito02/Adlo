import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePartStream } from '../usePartStream';
import { createPartStreamSlice } from '../../../stores/slices/partStreamSlice';
import type { PartStreamSlice } from '../../../stores/slices/partStreamSlice';
import type { DigitalLifeBridge } from '../../../../shared/ipc/digital-life';

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
});
