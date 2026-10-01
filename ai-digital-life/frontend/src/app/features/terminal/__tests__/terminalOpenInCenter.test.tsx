import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminalContextMenu } from '../useTerminalContextMenu';
import { useAppStore } from '@stores/slicedStore';

describe('useTerminalContextMenu.openInCenter', () => {
  beforeEach(() => useAppStore.setState({ centerTabs: [], centerActiveTabId: '' }));
  it('把标签移到中心', () => {
    const tabs = [{ id: 'tt1' } as never];
    const { result } = renderHook(() =>
      useTerminalContextMenu(
        tabs,
        () => {},
        () => {},
        () => {},
      ),
    );
    act(() =>
      result.current.setContextMenu({ open: true, x: 0, y: 0, tabId: 'tt1', isPinned: false }),
    );
    act(() => result.current.handleOpenInCenterFromMenu());
    expect(useAppStore.getState().centerTabs.some((t) => t.refId === 'tt1')).toBe(true);
  });
});
