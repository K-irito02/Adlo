import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

import { createTauriFileSaveBridge } from '../tauri-file-save';
import { createTauriBridge } from '../index';
import { createHttpBridge } from '../../httpBridge';

function okResult<T>(data: T) {
  return { ok: true as const, data };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('fileSaveBridge (system shell capability)', () => {
  it('saveToFile opens the native save dialog via Tauri invoke and returns the chosen path', async () => {
    mockInvoke.mockResolvedValue(okResult('E:/out.txt'));
    const bridge = createTauriFileSaveBridge();

    const res = await bridge.saveToFile({ suggestedName: 'clipboard-c1.txt', dataBase64: 'aGk=' });

    expect(mockInvoke).toHaveBeenCalledWith('app_save_file', {
      payload: { suggested_name: 'clipboard-c1.txt', data_base64: 'aGk=' },
    });
    expect(res).toEqual({ ok: true, data: { path: 'E:/out.txt' } });
  });

  it('saveToFile maps a cancelled dialog (Ok(None)) to an absent path', async () => {
    mockInvoke.mockResolvedValue(okResult(null));
    const bridge = createTauriFileSaveBridge();

    const res = await bridge.saveToFile({ suggestedName: 'clipboard-c1.txt', dataBase64: 'aGk=' });

    expect(res).toEqual({ ok: true, data: { path: undefined } });
  });

  it('saveToFile propagates a structured backend error', async () => {
    mockInvoke.mockRejectedValue({ code: 'IO_ERROR', message: 'disk full' });
    const bridge = createTauriFileSaveBridge();

    const res = await bridge.saveToFile({ suggestedName: 'clipboard-c1.txt', dataBase64: 'aGk=' });

    expect(res).toEqual({ ok: false, error: { code: 'IO_ERROR', message: 'disk full' } });
  });

  it('keeps the composed fileSave key set identical to http', () => {
    // tauri fileSave 系 http spread + 覆盖：加专属键而不同步契约时告警。
    const http = createHttpBridge({ baseUrl: 'http://127.0.0.1:1' });
    const tauri = createTauriBridge('http://127.0.0.1:1');
    expect(Object.keys(tauri.fileSave).sort()).toEqual(Object.keys(http.fileSave).sort());
  });
});
