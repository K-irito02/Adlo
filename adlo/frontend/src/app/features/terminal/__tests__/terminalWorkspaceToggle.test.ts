import { describe, it, expect } from 'vitest';
import { nextTerminalWorkspaceToggleValue } from '../terminalWorkspaceToggle';

// 事项 3 回归：终端目录行在"从未记录"时按渲染初态取默认 ——
// "默认终端目录"（__independent__）无记录即渲染展开，首点必须收起；
// 普通工作区行无记录即渲染折叠，首点必须展开。
describe('nextTerminalWorkspaceToggleValue', () => {
  it('collapses the default directory on first click (renders expanded when unrecorded)', () => {
    expect(nextTerminalWorkspaceToggleValue(undefined, true)).toBe(false);
  });

  it('expands a workspace row on first click (renders collapsed when unrecorded)', () => {
    expect(nextTerminalWorkspaceToggleValue(undefined, false)).toBe(true);
  });

  it('toggles recorded values', () => {
    expect(nextTerminalWorkspaceToggleValue(true, true)).toBe(false);
    expect(nextTerminalWorkspaceToggleValue(false, true)).toBe(true);
    expect(nextTerminalWorkspaceToggleValue(true, false)).toBe(false);
    expect(nextTerminalWorkspaceToggleValue(false, false)).toBe(true);
  });
});
