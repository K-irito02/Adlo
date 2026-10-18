import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  fileUrlToLocalPath,
  useBrowserAgentLinkSubscription,
} from './useBrowserAgentLinkSubscription';

const mocks = vi.hoisted(() => ({
  openUrlByMethod: vi.fn(),
  openFileByMethod: vi.fn(),
}));

vi.mock('@features/preview/openByMethod', () => ({
  openUrlByMethod: mocks.openUrlByMethod,
  openFileByMethod: mocks.openFileByMethod,
}));

vi.mock('../../../shared/env', () => ({
  isTauriShell: () => true,
}));

function setMockBrowser(overrides: Record<string, unknown> = {}) {
  (window as unknown as Record<string, unknown>).digitalLife = {
    browser: { ...overrides },
  };
}

describe('fileUrlToLocalPath', () => {
  it('strips the file:// scheme and repairs the Windows drive form', () => {
    expect(fileUrlToLocalPath('file:///C:/ws/a.md')).toBe('C:/ws/a.md');
  });

  it('percent-decodes the path', () => {
    expect(fileUrlToLocalPath('file:///C:/ws/my%20doc.md')).toBe('C:/ws/my doc.md');
  });

  it('returns non-file inputs unchanged', () => {
    expect(fileUrlToLocalPath('https://example.com/x')).toBe('https://example.com/x');
  });
});

describe('useBrowserAgentLinkSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).digitalLife;
  });

  it('opens a url via openUrlByMethod for kind=url', () => {
    const listener = vi.fn((_cb: (p: { kind: 'url' | 'file'; url: string }) => void) => () => {});
    setMockBrowser({ onAgentLink: listener });

    renderHook(() => useBrowserAgentLinkSubscription());

    expect(listener).toHaveBeenCalledTimes(1);
    const callback = listener.mock.calls[0][0];
    callback({ kind: 'url', url: 'https://example.com/x' });

    expect(mocks.openUrlByMethod).toHaveBeenCalledWith('https://example.com/x');
    expect(mocks.openFileByMethod).not.toHaveBeenCalled();
  });

  it('opens a local path via openFileByMethod for kind=file (normalized)', () => {
    const listener = vi.fn((_cb: (p: { kind: 'url' | 'file'; url: string }) => void) => () => {});
    setMockBrowser({ onAgentLink: listener });

    renderHook(() => useBrowserAgentLinkSubscription());

    const callback = listener.mock.calls[0][0];
    callback({ kind: 'file', url: 'file:///C:/ws/a.md' });

    expect(mocks.openFileByMethod).toHaveBeenCalledWith('C:/ws/a.md');
    expect(mocks.openUrlByMethod).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    setMockBrowser({ onAgentLink: listener });

    const { unmount } = renderHook(() => useBrowserAgentLinkSubscription());
    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});
