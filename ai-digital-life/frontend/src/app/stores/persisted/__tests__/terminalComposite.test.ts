import { describe, it, expect, beforeEach } from 'vitest';
import { hydrateAll, resetHydrationForTest } from '@stores/persisted/hydrate';
import { terminalCompositeHydrators } from '@stores/persisted/terminalComposite';
import type { StoreState } from '@stores/StoreState';

const VALID_TAB = {
  id: 't1',
  workspaceId: 'ws-1',
  title: 'PowerShell',
  profile: 'powershell',
  status: 'idle',
  isPinned: false,
  sortOrder: 1,
} as const;

describe('terminal composite hydration', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
  });

  it('rebuilds terminalTabsById from persisted tabs', () => {
    localStorage.setItem('adl:terminal.tabs', JSON.stringify([VALID_TAB]));
    const patch = hydrateAll().patch;
    expect(patch.terminalTabsById).toEqual({ t1: VALID_TAB });
  });

  it('does not contribute terminalTabsById when tabs are corrupt', () => {
    localStorage.setItem('adl:terminal.tabs', JSON.stringify('not-an-array'));
    const patch = hydrateAll().patch;
    expect(patch.terminalTabsById).toBeUndefined();
  });

  it('uses its own shellSelectorProfile when valid', () => {
    localStorage.setItem('adl:terminal.shellSelectorProfile', JSON.stringify('bash'));
    expect(hydrateAll().patch.shellSelectorProfile).toBe('bash');
  });

  it('falls back to defaultTerminalProfile when its own key is missing', () => {
    localStorage.setItem('adl:terminal.defaultProfile', JSON.stringify('cmd'));
    // own shell key absent → falls back to defaultTerminalProfile ('cmd'), not the static 'powershell'
    expect(hydrateAll().patch.shellSelectorProfile).toBe('cmd');
  });

  it('falls back to powershell when both keys are missing', () => {
    expect(hydrateAll().patch.shellSelectorProfile).toBe('powershell');
  });

  it('falls back to powershell when its own value is corrupt', () => {
    localStorage.setItem('adl:terminal.shellSelectorProfile', JSON.stringify('zsh'));
    expect(hydrateAll().patch.shellSelectorProfile).toBe('powershell');
  });

  it('dirty default profile key falls back to powershell instead of poisoning both fields', () => {
    localStorage.setItem('adl:terminal.defaultProfile', JSON.stringify('zsh'));
    localStorage.setItem('adl:terminal.shellSelectorProfile', JSON.stringify('oops'));
    const patch = hydrateAll().patch;
    expect(patch.defaultTerminalProfile).toBe('powershell');
    expect(patch.shellSelectorProfile).toBe('powershell');
  });

  it('restores persisted workspace id and selector profile', () => {
    localStorage.setItem('adl:terminal.workspaceId', JSON.stringify('ws-7'));
    localStorage.setItem('adl:terminal.shellSelectorProfile', JSON.stringify('bash'));
    const patch = hydrateAll().patch;
    expect(patch.terminalWorkspaceId).toBe('ws-7');
    expect(patch.shellSelectorProfile).toBe('bash');
  });

  it('hands every composite the simple-entry snapshot, never a previous composite derived value', () => {
    // 契约（composite.ts 的 priorPatch 文档）：priorPatch 只含「简单条目已产出的补丁」。
    // compositeHydrators / terminalCompositeHydrators 是应用内共享的复合水合器序列，
    // Phase 6 的四面板子状态会继续往上挂，故这里用探针挂在终端循环的最末尾 ——
    // 即排在两个循环的所有复合水合器之后，位置最能暴露「累积补丁被当 priorPatch 传下去」的写法。
    // 探针只往（已导出的）数组里临时挂一项、finally 原样还原，不新增任何生产接缝。
    const seen: Partial<StoreState>[] = [];
    const restore = terminalCompositeHydrators.slice();
    terminalCompositeHydrators.push({
      name: 'snapshot-probe',
      build: (_read, priorPatch) => {
        seen.push(priorPatch);
        return {};
      },
    });
    let patch: Partial<StoreState> = {};
    try {
      // 两侧都写入真实数据，使两个复合水合器都确实产出派生字段，
      // 否则「别的复合的派生值是否泄漏」这条断言会因无值可漏而空转。
      localStorage.setItem('adl:terminal.tabs', JSON.stringify([VALID_TAB]));
      localStorage.setItem(
        'adl:browser.tabs',
        JSON.stringify([{ id: 'browser-1', title: 'Example', url: 'https://example.com' }]),
      );
      patch = hydrateAll().patch;
    } finally {
      terminalCompositeHydrators.splice(0, terminalCompositeHydrators.length, ...restore);
    }

    // 累积补丁照旧：复合结果仍写进返回的 patch（Object.assign 目标未变）
    expect(patch.terminalTabsById).toEqual({ t1: VALID_TAB });
    expect(patch.browserTabsById).toHaveProperty('browser-1');

    const priorPatch = seen[0] as Record<string, unknown>;
    // 简单条目在快照里 —— 终端三档回退的中间档正取自这里（有 fallback，故恒有值）
    expect(priorPatch.defaultTerminalProfile).toBe('powershell');
    // 先跑的 browser 复合水合器的派生输出不得泄漏进快照
    expect('browserTabsById' in priorPatch).toBe(false);
    // 同一循环里先跑的终端复合水合器的派生输出同样不得泄漏
    expect('terminalTabsById' in priorPatch).toBe(false);
  });
});
