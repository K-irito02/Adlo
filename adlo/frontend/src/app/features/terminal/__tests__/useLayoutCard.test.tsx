// src/app/features/terminal/__tests__/useLayoutCard.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEqualOnlyLayoutCardCloser } from '../useLayoutCard';
import type { PaneLayoutMode } from '../terminalPaneLayout';

function renderCloser(mode: PaneLayoutMode, open: boolean, close: () => void) {
  return renderHook(({ m, o }) => useEqualOnlyLayoutCardCloser(m, o, close), {
    initialProps: { m: mode, o: open },
  });
}

describe('useEqualOnlyLayoutCardCloser', () => {
  it('切到非 equal 即关闭一次，已是 equal 不动作', () => {
    const close = vi.fn();
    const { rerender } = renderCloser('equal', true, close);
    expect(close).not.toHaveBeenCalled();
    rerender({ m: 'free', o: true });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('未打开时不调用关闭', () => {
    const close = vi.fn();
    renderCloser('free', false, close);
    expect(close).not.toHaveBeenCalled();
  });
});
