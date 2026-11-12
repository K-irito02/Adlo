import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGlobalBrowserMeta } from '../useGlobalBrowserMeta';
import { pageMetaClient } from '@utils/pageMetaClient';

const onMetaChanged = vi.fn((_listener: (tabId: string, meta: unknown) => void) => () => {});
const { getState } = vi.hoisted(() => ({ getState: vi.fn(() => ({ browserTabs: [] })) }));

vi.mock('@shared/env', () => ({ isTauriShell: () => true }));
vi.mock('@stores', () => ({ useAppStore: { getState } }));
vi.mock('@utils/pageMetaClient', () => ({
  pageMetaClient: {
    subscribeUpdated: vi.fn(() => () => {}),
  },
}));

describe('useGlobalBrowserMeta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as Record<string, unknown>).digitalLife = {
      browser: { onMetaChanged },
    };
  });

  it('subscribes to native meta and server broadcasts exactly once', () => {
    renderHook(() => useGlobalBrowserMeta());
    expect(onMetaChanged).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pageMetaClient.subscribeUpdated)).toHaveBeenCalledTimes(1);
  });
});
