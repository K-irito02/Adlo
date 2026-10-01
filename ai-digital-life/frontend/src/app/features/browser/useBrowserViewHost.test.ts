import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@shared/env', () => ({ isTauriShell: () => false }));

describe('useBrowserViewHost', () => {
  it('非 Tauri 下返回稳定 containerRef', async () => {
    const { useBrowserViewHost } = await import('./useBrowserViewHost');
    const { result } = renderHook(() =>
      useBrowserViewHost({
        hostId: 'center',
        activeTab: undefined,
        isVisible: true,
        overlayActive: false,
      }),
    );
    expect(result.current.containerRef).toBeDefined();
  });
});
