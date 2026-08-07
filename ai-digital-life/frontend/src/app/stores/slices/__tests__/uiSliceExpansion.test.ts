import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../slicedStore';

describe('uiSliceExpansion expandedSessionWorkspaces', () => {
  beforeEach(() => {
    useAppStore.setState({ expandedSessionWorkspaces: {} });
  });

  it('expands a workspace when currently collapsed', () => {
    useAppStore.getState().toggleSessionWorkspace('/path/ws', false);
    expect(useAppStore.getState().expandedSessionWorkspaces['/path/ws']).toBe(true);
  });

  it('collapses a workspace when currently expanded', () => {
    useAppStore.getState().toggleSessionWorkspace('/path/ws', true);
    expect(useAppStore.getState().expandedSessionWorkspaces['/path/ws']).toBe(false);
  });

  it('does not guess the default from an undefined stored value', () => {
    // 显示层以 ?? item.isCurrent 决定当前状态；store 必须忠实翻转传入值，
    // 而非沿用旧 `?? true` 默认（该默认与显示默认矛盾会导致首次点击无效）。
    useAppStore.getState().toggleSessionWorkspace('/path/ws', false);
    expect(useAppStore.getState().expandedSessionWorkspaces['/path/ws']).toBe(true);

    useAppStore.getState().toggleSessionWorkspace('/path/ws2', true);
    expect(useAppStore.getState().expandedSessionWorkspaces['/path/ws2']).toBe(false);
  });
});
