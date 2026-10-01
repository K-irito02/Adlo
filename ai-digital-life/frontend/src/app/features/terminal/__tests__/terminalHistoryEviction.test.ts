import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { STORAGE_HYDRATION_DELAY_MS } from '@stores/constants';
import type { TerminalTabState } from '@stores/slices/terminalSliceTypes';
import { useTerminalPtyLifecycle } from '../useTerminalPtyLifecycle';
import { terminalPtyRuntime } from '../terminalPtyRuntime';
import { terminalOutputStore } from '../terminalOutputStore';
import { terminalHistoryStore, type TerminalHistorySegment } from '../terminalHistoryStore';
import {
  TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
  TERMINAL_HISTORY_MIN_SEGMENTS_KEPT,
} from '../terminalHistoryBudget';

const TAB_ID = 'tab-1';
const LIVE_SESSION = 'live-1';
const OLDEST = 'old-seg';

/** 一段已结束历史：chunks 的 size 之和即该段体积（逐块删除的键为 `${sessionId}#${seq}`） */
function segment(sessionId: string, endedAt: number, sizes: number[]): TerminalHistorySegment {
  return { sessionId, endedAt, live: false, chunks: sizes.map((size) => ({ lines: 1, size })) };
}

/**
 * 21 段已结束历史（刚好越过 20 段安全阀 → 仅最旧一段可淘汰）。
 * 最旧段独占 2× 默认预算 → 淘汰它之后总量立刻回到预算内，即「只淘汰一段」。
 */
function buildIndex(): Record<string, TerminalHistorySegment[]> {
  const segments = [segment(OLDEST, 1, [TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES * 2, 1])];
  for (let i = 2; i <= TERMINAL_HISTORY_MIN_SEGMENTS_KEPT + 1; i += 1) {
    segments.push(segment(`sib-${i}`, i, [1]));
  }
  return { [TAB_ID]: segments };
}

const TAB: TerminalTabState = {
  id: TAB_ID,
  workspaceId: '',
  title: 'T',
  profile: 'powershell',
  sessionId: LIVE_SESSION,
  status: 'running',
  isPinned: false,
  sortOrder: 0,
};

// 第一个测试前必须等 slice 的惰性水合跑完：它会 set({ terminalTabs }) 覆盖掉本测试塞的标签。
let hydrationSettled: Promise<void> | null = null;
function settleHydration(): Promise<void> {
  hydrationSettled ??= new Promise((resolve) =>
    setTimeout(resolve, STORAGE_HYDRATION_DELAY_MS + 50),
  );
  return hydrationSettled;
}

const initialActiveRightTool = useAppStore.getState().activeRightTool;

let emitPtyOutput:
  | ((event: { sessionId: string; data: string; terminated: boolean }) => void)
  | null;
let saveAllSpy: MockInstance<typeof terminalHistoryStore.saveAll>;
let deleteSpy: MockInstance<typeof terminalOutputStore.delete>;
let subscribeSpy: MockInstance<
  (cb: (event: { sessionId: string; data: string; terminated: boolean }) => void) => () => void
>;

beforeEach(async () => {
  await settleHydration();
  emitPtyOutput = null;
  useAppStore.setState({
    terminalTabs: [TAB],
    terminalTabsById: { [TAB_ID]: TAB },
    terminalActiveTabId: TAB_ID,
    activeRightTool: 'terminal',
  });
  vi.spyOn(terminalHistoryStore, 'loadAll').mockReturnValue(buildIndex());
  saveAllSpy = vi.spyOn(terminalHistoryStore, 'saveAll').mockImplementation(() => {});
  deleteSpy = vi.spyOn(terminalOutputStore, 'delete').mockResolvedValue(undefined);
  subscribeSpy = vi.fn(
    (cb: (event: { sessionId: string; data: string; terminated: boolean }) => void) => {
      emitPtyOutput = cb;
      return () => {};
    },
  );
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    subscribePtyOutput: subscribeSpy,
    terminalOutput: {
      save: vi.fn(async () => ({ ok: true })),
      load: vi.fn(async () => ({ ok: false })),
      delete: vi.fn(async () => ({ ok: true })),
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  // 运行时是应用级单例：测试间必须重置，否则第二个用例不会用新 spy 重新订阅。
  terminalPtyRuntime.reset();
  delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  useAppStore.setState({
    terminalTabs: [],
    terminalTabsById: {},
    terminalActiveTabId: '',
    activeRightTool: initialActiveRightTool,
  });
});

/** 采集一次（走 PTY 输出的节流入口）→ 触发预算结算，并排空其异步链 */
async function collectOnce(): Promise<void> {
  expect(subscribeSpy).toHaveBeenCalled();
  await act(async () => {
    emitPtyOutput?.({ sessionId: LIVE_SESSION, data: 'x', terminated: false });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('settleHistoryBudget 的淘汰范围', () => {
  it('只删除被淘汰段的块记录，同标签其它段的块记录不动', async () => {
    renderHook(() => useTerminalPtyLifecycle({ activeTab: undefined }));

    await collectOnce();

    const deletedKeys = deleteSpy.mock.calls.map((call) => call[0] as string);
    // 被淘汰段（最旧、2 GiB）的全部块被删 …
    expect(deletedKeys.sort()).toEqual([`${OLDEST}#0`, `${OLDEST}#1`]);
    // … 同标签兄弟段的块一条都不能被删（deleteHistoryForTab 的整标签删除会毁掉它们）
    expect(deletedKeys.filter((key) => key.startsWith('sib-'))).toEqual([]);
  });

  it('索引只移除被淘汰段，兄弟段仍在持久化快照里', async () => {
    renderHook(() => useTerminalPtyLifecycle({ activeTab: undefined }));

    await collectOnce();

    const snapshot = saveAllSpy.mock.calls.at(-1)?.[0] as Record<string, TerminalHistorySegment[]>;
    const sessionIds = snapshot[TAB_ID].map((s) => s.sessionId);
    expect(sessionIds).not.toContain(OLDEST);
    expect(sessionIds).toContain('sib-2');
    expect(sessionIds.filter((id) => id.startsWith('sib-'))).toHaveLength(
      TERMINAL_HISTORY_MIN_SEGMENTS_KEPT,
    );
  });
});

describe('deleteHistoryForTab 的整标签语义（Task 14 的「删除」按钮）', () => {
  it('删除该标签全部段的块记录与索引条目', async () => {
    vi.spyOn(terminalHistoryStore, 'loadAll').mockReturnValue({
      [TAB_ID]: [segment('a', 1, [1, 1]), segment('b', 2, [1])],
    });
    const { result } = renderHook(() => useTerminalPtyLifecycle({ activeTab: undefined }));

    await act(async () => {
      await result.current.deleteHistoryForTab(TAB_ID);
    });

    expect(deleteSpy.mock.calls.map((call) => call[0]).sort()).toEqual(['a#0', 'a#1', 'b#0']);
    const snapshot = saveAllSpy.mock.calls.at(-1)?.[0] as Record<string, TerminalHistorySegment[]>;
    expect(snapshot[TAB_ID]).toBeUndefined();
  });
});
