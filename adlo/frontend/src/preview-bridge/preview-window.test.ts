import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DigitalLifeBridge } from '../shared/ipc/digital-life';
import { createPreviewWindowBridge } from './preview-window';

const requestPreviewApi = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, data: true })));

vi.mock('../shared/ipc/preview-api', () => ({ requestPreviewApi }));

type MockWindow = DigitalLifeBridge['window'];

function createBridge(mockWindow: MockWindow) {
  return createPreviewWindowBridge(mockWindow).window;
}

describe('preview window bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes openPath to the same-machine preview service instead of pretending it worked', async () => {
    const window = createBridge({} as MockWindow);

    const result = await window.openPath('C:/adlo/logs');

    expect(requestPreviewApi).toHaveBeenCalledWith('/system/open-path', {
      method: 'POST',
      body: JSON.stringify({ path: 'C:/adlo/logs' }),
    });
    expect(result).toEqual({ ok: true, data: true });
  });
});
