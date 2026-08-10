import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockInvoke, mockListen } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

import { createTauriWorkspaceBridge } from '../tauri-workspace';

function okResult<T>(data: T) {
  return { ok: true as const, data };
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset();
  mockListen.mockResolvedValue(() => {});
});

describe('workspaceBridge (system shell capabilities)', () => {
  it('pickDirectory opens the native folder dialog via Tauri invoke', async () => {
    mockInvoke.mockResolvedValue(okResult('/picked/path'));
    const bridge = createTauriWorkspaceBridge();
    const res = await bridge.pickDirectory();
    expect(mockInvoke).toHaveBeenCalledWith('workspace_pick_directory', undefined);
    expect(res).toEqual({ ok: true, data: '/picked/path' });
  });

  it('pickDirectory maps a cancelled dialog (null) to undefined', async () => {
    mockInvoke.mockResolvedValue(okResult(null));
    const bridge = createTauriWorkspaceBridge();
    const res = await bridge.pickDirectory();
    expect(res).toEqual({ ok: true, data: undefined });
  });

  it('revealInFileManager reveals the path in the OS file manager via Tauri invoke', async () => {
    mockInvoke.mockResolvedValue(okResult(true));
    const bridge = createTauriWorkspaceBridge();
    const res = await bridge.revealInFileManager('E:/project/src/main.ts');
    expect(mockInvoke).toHaveBeenCalledWith('workspace_reveal_in_file_manager', {
      path: 'E:/project/src/main.ts',
    });
    expect(res).toEqual({ ok: true, data: true });
  });

  it('onFileChanged subscribes to the Tauri file-change channel', () => {
    const bridge = createTauriWorkspaceBridge();
    const listener = vi.fn();
    const unsubscribe = bridge.onFileChanged(listener);

    expect(mockListen).toHaveBeenCalledWith(
      'digital-life://workspace-file-changed',
      expect.any(Function),
    );

    const handler = mockListen.mock.calls[0][1];
    const event = { path: 'src/main.ts', lastModifiedAt: 123 };
    handler({ payload: event });
    expect(listener).toHaveBeenCalledWith(event);

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
