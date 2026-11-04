import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOpenInCenterAction } from '../useOpenInCenterAction';
import { useAppStore } from '@stores/slicedStore';

describe('openUrlInCenter', () => {
  beforeEach(() =>
    useAppStore.setState({
      browserTabs: [],
      browserActiveTabId: '',
      centerTabs: [],
      centerActiveTabId: '',
    }),
  );
  it('以该 URL 新建中心浏览器标签', () => {
    const { result } = renderHook(() => useOpenInCenterAction());
    act(() => result.current.openUrlInCenter('https://x.test', 'X'));
    const s = useAppStore.getState();
    expect(s.centerTabs.some((t) => t.kind === 'browser')).toBe(true);
    expect(s.browserActiveTabId).not.toBe(s.centerTabs.find((t) => t.kind === 'browser')?.refId);
  });
});
