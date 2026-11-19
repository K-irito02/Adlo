import { afterEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../slicedStore';

describe('剪贴板记录来源工作区', () => {
  afterEach(() => {
    useAppStore.getState().clearClipboard();
  });

  it('复制/剪切记录来源工作区路径，清空后一并复位', () => {
    useAppStore.getState().setClipboard('copy', 'notes/a.txt', '/ws/a');

    expect(useAppStore.getState().clipboardSourceWorkspacePath).toBe('/ws/a');
    expect(useAppStore.getState().clipboardSourcePath).toBe('notes/a.txt');

    useAppStore.getState().clearClipboard();

    expect(useAppStore.getState().clipboardSourceWorkspacePath).toBeNull();
    expect(useAppStore.getState().clipboardOperation).toBeNull();
  });

  it('未提供来源工作区时保持为空（回落当前激活工作区语义）', () => {
    useAppStore.getState().setClipboard('cut', 'a.txt');

    expect(useAppStore.getState().clipboardSourceWorkspacePath).toBeNull();
  });
});
