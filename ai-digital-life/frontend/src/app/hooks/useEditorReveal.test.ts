import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEditorReveal } from './useEditorReveal';
import { useAppStore } from '@stores/slicedStore';
import type { EditorRef } from '../stores/types';

/**
 * 语法扩展就绪闸门（方案 D）在测试里默认放行：真实实现依赖动态 import 的模块缓存，
 * 在 jsdom 中永远不会就绪，会把每个用例都拖到 1200ms 上限。需要验证闸门行为的用例
 * 自行把 `languageReady.value` 置 false。
 */
const languageReady = vi.hoisted(() => ({ value: true }));
vi.mock('../features/editor/cmLanguages', () => ({
  isLanguageExtensionReady: () => languageReady.value,
  preloadLanguageExtension: () => {},
}));

afterEach(() => {
  useAppStore.getState().setPositioningPath(null);
  useAppStore.getState().setFileOpenError(null);
  languageReady.value = true;
});

function makeContent(prefix: string, lines: number): string {
  return Array.from({ length: lines }, (_, i) => `${prefix} line ${i + 1}`).join('\n');
}

interface NumberBox {
  value: number;
}

/** 渲染实测偏差：null = 目标未渲染（视口外），无法实测。 */
interface DeltaBox {
  value: number | null;
}

function makeMockEditor(
  docLines: NumberBox,
  visibleRanges: { value: { startLineNumber: number; endLineNumber: number }[] } = {
    value: [{ startLineNumber: 1, endLineNumber: 60 }],
  },
  centerDelta: DeltaBox = { value: 0 },
  scrollTop: NumberBox = { value: 0 },
) {
  return {
    getModel: () => ({
      getLineCount: () => docLines.value,
    }),
    revealLineInCenter: vi.fn(),
    setPosition: vi.fn(),
    focus: vi.fn(),
    getSelection: () => null,
    getLineCenterDelta: () => centerDelta.value,
    getScrollTop: () => scrollTop.value,
    setScrollPosition: vi.fn((position: { scrollTop: number }) => {
      scrollTop.value = position.scrollTop;
    }),
    getVisibleRanges: () =>
      visibleRanges.value.map((r) => ({
        startLineNumber: r.startLineNumber,
        startColumn: 1,
        endLineNumber: r.endLineNumber,
        endColumn: 1,
      })),
  } as unknown as EditorRef;
}

interface RevealProps {
  selectedFilePath: string | undefined;
  fileContent: string | undefined;
  fileLastModifiedAt: number | undefined;
}

function setup(
  initial: RevealProps,
  docLines: NumberBox,
  mountEditor = true,
  visibleRanges?: { value: { startLineNumber: number; endLineNumber: number }[] },
  centerDelta: DeltaBox = { value: 0 },
  scrollTop: NumberBox = { value: 0 },
) {
  const mockEditor = makeMockEditor(docLines, visibleRanges, centerDelta, scrollTop);
  const pendingRevealRef = { current: null } as React.MutableRefObject<{
    path: string;
    line: number;
  } | null>;
  const setPendingReveal = (path: string, line: number) => {
    pendingRevealRef.current = { path, line };
  };
  const actions = { openFile: vi.fn(() => Promise.resolve()) };
  const propsRef = { current: initial };
  const { result, rerender, unmount } = renderHook(
    () =>
      useEditorReveal(
        propsRef.current.selectedFilePath,
        undefined,
        propsRef.current.fileLastModifiedAt,
        actions,
        pendingRevealRef,
        setPendingReveal,
        propsRef.current.fileContent,
      ),
    {},
  );
  // hook 内部持有 standardEditorRef：把 mock 编辑器装进去（即 CodeEditor onMount 做的事）
  if (mountEditor) {
    act(() => {
      result.current.standardEditorRef.current = mockEditor;
    });
  }
  const setProps = (next: RevealProps) => {
    propsRef.current = next;
    rerender();
  };
  return { result, rerender, unmount, setProps, mockEditor, actions, pendingRevealRef };
}

describe('useEditorReveal pending handshake (事项 46)', () => {
  it('does not reveal on the previous file content during openFile transition (#5)', () => {
    // 旧文件与目标文件恰好同为 57 行：中间态（路径已切新文件、内容仍是旧文件）
    // 与"新鲜"不可区分时，必须等待新内容到达，不得在旧文档上揭示。
    const contentA = makeContent('old', 57);
    const contentB = makeContent('new', 57);
    const docLines = { value: 57 };
    const { result, setProps, mockEditor } = setup(
      { selectedFilePath: 'A.md', fileContent: contentA, fileLastModifiedAt: 1 },
      docLines,
    );

    act(() => {
      result.current.handleOpenFileAtLine('B.md', 56);
    });

    // 中间提交：路径已是 B，内容仍是 A（缓存未命中时 openFile 先只设路径）
    setProps({ selectedFilePath: 'B.md', fileContent: contentA, fileLastModifiedAt: 1 });
    expect(mockEditor.revealLineInCenter).not.toHaveBeenCalled();

    // 新内容到达：此时才允许揭示
    setProps({ selectedFilePath: 'B.md', fileContent: contentB, fileLastModifiedAt: 2 });
    expect(mockEditor.revealLineInCenter).toHaveBeenCalledWith(56);
  });

  it('does not reveal when model still holds the previous longer file (#1)', () => {
    // AGENTS.md（123 行）→ .agents/rules/phase-boundary.md（57 行）：
    // 中间态模型 123 行、内容 123 行，行号 51 看似合法，实为旧文档。
    const contentA = makeContent('old', 123);
    const contentB = makeContent('new', 57);
    const docLines = { value: 123 };
    const { result, setProps, mockEditor } = setup(
      { selectedFilePath: 'AGENTS.md', fileContent: contentA, fileLastModifiedAt: 1 },
      docLines,
    );

    act(() => {
      result.current.handleOpenFileAtLine('.agents/rules/phase-boundary.md', 51);
    });

    docLines.value = 123;
    setProps({
      selectedFilePath: '.agents/rules/phase-boundary.md',
      fileContent: contentA,
      fileLastModifiedAt: 1,
    });
    expect(mockEditor.revealLineInCenter).not.toHaveBeenCalled();

    docLines.value = 57;
    setProps({
      selectedFilePath: '.agents/rules/phase-boundary.md',
      fileContent: contentB,
      fileLastModifiedAt: 2,
    });
    expect(mockEditor.revealLineInCenter).toHaveBeenCalledWith(51);
  });

  it('still reveals immediately when the target file is already open', () => {
    // 已打开文件的点击不得被新门控误伤（防回退）。
    const contentB = makeContent('new', 57);
    const docLines = { value: 57 };
    const { result, setProps, mockEditor } = setup(
      { selectedFilePath: 'B.md', fileContent: contentB, fileLastModifiedAt: 2 },
      docLines,
    );

    act(() => {
      result.current.handleOpenFileAtLine('B.md', 56);
    });
    setProps({ selectedFilePath: 'B.md', fileContent: contentB, fileLastModifiedAt: 2 });
    expect(mockEditor.revealLineInCenter).toHaveBeenCalledWith(56);
  });

  it('reveals after a late editor mount with no store change (lazy Suspense first display)', () => {
    // 首开文件时 lazy chunk 未就绪：挂载（无 store 变更）后必须补跳，不得烂掉 pending。
    vi.useFakeTimers();
    try {
      const contentB = makeContent('new', 57);
      const docLines = { value: 57 };
      const { result, setProps, mockEditor } = setup(
        { selectedFilePath: undefined, fileContent: undefined, fileLastModifiedAt: undefined },
        docLines,
        false,
      );

      act(() => {
        result.current.handleOpenFileAtLine('B.md', 56);
      });
      // 路径先到（编辑器仍缺席）
      setProps({ selectedFilePath: 'B.md', fileContent: undefined, fileLastModifiedAt: undefined });
      expect(mockEditor.revealLineInCenter).not.toHaveBeenCalled();
      // 内容到达（编辑器仍缺席）
      setProps({ selectedFilePath: 'B.md', fileContent: contentB, fileLastModifiedAt: 2 });
      expect(mockEditor.revealLineInCenter).not.toHaveBeenCalled();
      // chunk 到达：挂载，无任何 store 变更
      act(() => {
        result.current.standardEditorRef.current = mockEditor;
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(mockEditor.revealLineInCenter).toHaveBeenCalledWith(56);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-dispatches the reveal when the target line is not visible after layout (HTML 大文件)', () => {
    // 新挂载未量测视图上 scrollIntoView 按零高度解析、视口落错：复核必须补一次。
    vi.useFakeTimers();
    try {
      const contentB = makeContent('new', 1473);
      const docLines = { value: 1473 };
      const visibleRanges = { value: [{ startLineNumber: 1, endLineNumber: 40 }] };
      const { result, setProps } = setup(
        { selectedFilePath: undefined, fileContent: undefined, fileLastModifiedAt: undefined },
        docLines,
        false,
        visibleRanges,
      );
      const editorWithRanges = makeMockEditor(docLines, visibleRanges);
      act(() => {
        result.current.standardEditorRef.current = editorWithRanges;
      });

      act(() => {
        result.current.handleOpenFileAtLine('big.html', 1439);
      });
      setProps({ selectedFilePath: 'big.html', fileContent: contentB, fileLastModifiedAt: 2 });
      const revealSpy = vi.mocked(editorWithRanges.revealLineInCenter);
      expect(revealSpy).toHaveBeenCalledWith(1439);
      const callsAfterFirstReveal = revealSpy.mock.calls.length;
      // 布局稳定后复核：目标仍不可视 → 补一次
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(revealSpy.mock.calls.length).toBeGreaterThan(callsAfterFirstReveal);
      expect(revealSpy).toHaveBeenLastCalledWith(1439);
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds the surface hidden while positioning and shows it once revealed', () => {
    // 定位期间 positioningPath 置位（表面隐藏），布局稳定即摘帘显现。
    vi.useFakeTimers();
    try {
      const contentA = makeContent('old', 57);
      const contentB = makeContent('new', 57);
      const docLines = { value: 57 };
      const { result, setProps, mockEditor, pendingRevealRef } = setup(
        { selectedFilePath: 'A.md', fileContent: contentA, fileLastModifiedAt: 1 },
        docLines,
      );

      act(() => {
        result.current.handleOpenFileAtLine('B.md', 56);
      });
      expect(useAppStore.getState().positioningPath).toBe('B.md');

      setProps({ selectedFilePath: 'B.md', fileContent: contentB, fileLastModifiedAt: 2 });
      expect(mockEditor.revealLineInCenter).toHaveBeenCalledWith(56);
      expect(pendingRevealRef.current).toBeNull();
      // 揭示 dispatch 后帘子仍在：等布局稳定（top 连续两次不变）
      expect(useAppStore.getState().positioningPath).toBe('B.md');
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(useAppStore.getState().positioningPath).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('nudges by the measured rendered delta and lifts the curtain only once aligned', () => {
    // 渲染实测偏差 120px：必须按偏差直接校正 scrollTop（不再相信内部高度表估算），
    // 未收敛前不摘帘；连续两次落在容差内才显现。
    vi.useFakeTimers();
    try {
      const contentB = makeContent('new', 1473);
      const docLines = { value: 1473 };
      const centerDelta = { value: 120 };
      const scrollTop = { value: 5000 };
      const visibleRanges = { value: [{ startLineNumber: 1400, endLineNumber: 1473 }] };
      const { result, setProps, pendingRevealRef } = setup(
        { selectedFilePath: 'A.md', fileContent: makeContent('old', 57), fileLastModifiedAt: 1 },
        docLines,
        true,
        visibleRanges,
        centerDelta,
        scrollTop,
      );
      const editor = makeMockEditor(docLines, visibleRanges, centerDelta, scrollTop);
      act(() => {
        result.current.standardEditorRef.current = editor;
      });

      act(() => {
        result.current.handleOpenFileAtLine('big.html', 1439);
      });
      setProps({ selectedFilePath: 'big.html', fileContent: contentB, fileLastModifiedAt: 2 });
      expect(pendingRevealRef.current).toBeNull();
      expect(useAppStore.getState().positioningPath).toBe('big.html');

      // 第一次监督 tick：按实测偏差一步校正（5000 + 120）
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(editor.setScrollPosition).toHaveBeenCalledWith({ scrollTop: 5120 });
      expect(useAppStore.getState().positioningPath).toBe('big.html');

      // 渲染回正：一次采样不够，连续两次才摘帘
      centerDelta.value = 0;
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(useAppStore.getState().positioningPath).toBe('big.html');
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(useAppStore.getState().positioningPath).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('abandons the pending reveal and shows the surface when opening fails', () => {
    // 开文件失败：主区错误视图即终态，不揭示、不隐藏。
    const contentA = makeContent('old', 57);
    const docLines = { value: 57 };
    const { result, setProps, mockEditor, pendingRevealRef } = setup(
      { selectedFilePath: 'A.md', fileContent: contentA, fileLastModifiedAt: 1 },
      docLines,
    );

    act(() => {
      result.current.handleOpenFileAtLine('gone.md', 10);
    });
    expect(useAppStore.getState().positioningPath).toBe('gone.md');

    act(() => {
      useAppStore
        .getState()
        .setFileOpenError({ path: 'gone.md', code: 'NOT_FOUND', message: 'gone' });
    });
    setProps({
      selectedFilePath: 'gone.md',
      fileContent: undefined,
      fileLastModifiedAt: undefined,
    });
    expect(mockEditor.revealLineInCenter).not.toHaveBeenCalled();
    expect(pendingRevealRef.current).toBeNull();
    expect(useAppStore.getState().positioningPath).toBeNull();
  });

  it('reveals when the new content happens to equal the old content (1.2)', () => {
    // 同内容跨文件：mtime 不同即放行，不误判为中间态。
    const same = makeContent('same', 57);
    const docLines = { value: 57 };
    const { result, setProps, mockEditor } = setup(
      { selectedFilePath: 'A.md', fileContent: same, fileLastModifiedAt: 1 },
      docLines,
    );

    act(() => {
      result.current.handleOpenFileAtLine('B.md', 56);
    });
    setProps({ selectedFilePath: 'B.md', fileContent: same, fileLastModifiedAt: 2 });
    expect(mockEditor.revealLineInCenter).toHaveBeenCalledWith(56);
  });

  it('clears the curtain when superseded mid-stabilization (1.4)', () => {
    // 稳定轮询期间被新 pending 取代：不清帘会永久隐藏，必须显现。
    vi.useFakeTimers();
    try {
      const contentA = makeContent('old', 57);
      const contentB = makeContent('new', 57);
      const docLines = { value: 57 };
      const { result, setProps, pendingRevealRef } = setup(
        { selectedFilePath: 'A.md', fileContent: contentA, fileLastModifiedAt: 1 },
        docLines,
      );

      act(() => {
        result.current.handleOpenFileAtLine('B.md', 56);
      });
      setProps({ selectedFilePath: 'B.md', fileContent: contentB, fileLastModifiedAt: 2 });
      expect(useAppStore.getState().positioningPath).toBe('B.md');
      // 新跳转到达（还未置帘）：旧稳定轮询中止时必须清掉旧帘。
      act(() => {
        pendingRevealRef.current = { path: 'C.md', line: 1 };
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(useAppStore.getState().positioningPath).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not dispatch after unmount (1.5)', () => {
    // 卸载清理全部计时器：迟挂载＋复核都不再触发。
    vi.useFakeTimers();
    try {
      const docLines = { value: 57 };
      const { result, setProps, mockEditor, pendingRevealRef, unmount } = setup(
        { selectedFilePath: undefined, fileContent: undefined, fileLastModifiedAt: undefined },
        docLines,
        false,
      );

      act(() => {
        result.current.handleOpenFileAtLine('B.md', 56);
      });
      setProps({ selectedFilePath: 'B.md', fileContent: undefined, fileLastModifiedAt: undefined });
      const revealSpy = vi.mocked(mockEditor.revealLineInCenter);
      const callsBefore = revealSpy.mock.calls.length;
      unmount();
      pendingRevealRef.current = null;
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(revealSpy.mock.calls.length).toBe(callsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits instead of dispatching on a detached view (1.7)', () => {
    // 销毁视图（isConnected false）：不 dispatch，超时放弃并显现。
    vi.useFakeTimers();
    try {
      const contentB = makeContent('new', 57);
      const docLines = { value: 57 };
      const detached = {
        getModel: () => ({ getLineCount: () => 57 }),
        revealLineInCenter: vi.fn(),
        setPosition: vi.fn(),
        focus: vi.fn(),
        getSelection: () => null,
        getVisibleRanges: () => [],
        getDomNode: () => ({ isConnected: false }),
      } as unknown as EditorRef;
      const { result, setProps, pendingRevealRef } = setup(
        { selectedFilePath: 'A.md', fileContent: makeContent('old', 57), fileLastModifiedAt: 1 },
        docLines,
      );
      act(() => {
        result.current.standardEditorRef.current = detached;
      });

      act(() => {
        result.current.handleOpenFileAtLine('B.md', 56);
      });
      setProps({ selectedFilePath: 'B.md', fileContent: contentB, fileLastModifiedAt: 2 });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(detached.revealLineInCenter).not.toHaveBeenCalled();
      expect(pendingRevealRef.current).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(pendingRevealRef.current).toBeNull();
      expect(useAppStore.getState().positioningPath).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('schedules a verify pass for already-open files (1.3)', () => {
    // 已打开大文件直接揭示同样复核：目标不可视则补跳。
    vi.useFakeTimers();
    try {
      const contentB = makeContent('new', 1473);
      const docLines = { value: 1473 };
      const visibleRanges = { value: [{ startLineNumber: 1, endLineNumber: 40 }] };
      const { result, setProps } = setup(
        { selectedFilePath: 'big.html', fileContent: contentB, fileLastModifiedAt: 2 },
        docLines,
        true,
        visibleRanges,
      );
      const editor = makeMockEditor(docLines, visibleRanges);
      act(() => {
        result.current.standardEditorRef.current = editor;
      });

      act(() => {
        result.current.handleOpenFileAtLine('big.html', 1439);
      });
      setProps({ selectedFilePath: 'big.html', fileContent: contentB, fileLastModifiedAt: 2 });
      const spy = vi.mocked(editor.revealLineInCenter);
      expect(spy).toHaveBeenCalledWith(1439);
      const first = spy.mock.calls.length;
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(spy.mock.calls.length).toBeGreaterThan(first);
      expect(spy).toHaveBeenLastCalledWith(1439);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the target language extension before revealing (方案 D)', () => {
    // 语法扩展未就绪（异步 import 未完成）时不揭示：扩展 resolve 后的 reconfigure
    // 会触发重新量测，把刚定位好的落点推走（"首次点击不准"的嫌疑变量之一）。
    vi.useFakeTimers();
    try {
      languageReady.value = false;
      const contentB = makeContent('new', 57);
      const docLines = { value: 57 };
      const { result, setProps, mockEditor } = setup(
        { selectedFilePath: 'A.md', fileContent: makeContent('old', 57), fileLastModifiedAt: 1 },
        docLines,
      );

      act(() => {
        result.current.handleOpenFileAtLine('B.md', 56);
      });
      setProps({ selectedFilePath: 'B.md', fileContent: contentB, fileLastModifiedAt: 2 });
      expect(mockEditor.revealLineInCenter).not.toHaveBeenCalled();

      // 扩展就绪后由兜底 tick 放行
      languageReady.value = true;
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(mockEditor.revealLineInCenter).toHaveBeenCalledWith(56);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the language gate after the cap so a failed load cannot block reveals', () => {
    // 扩展加载失败不得让揭示永久卡死：到上限即放行。
    vi.useFakeTimers();
    try {
      languageReady.value = false;
      const contentB = makeContent('new', 57);
      const docLines = { value: 57 };
      const { result, setProps, mockEditor } = setup(
        { selectedFilePath: 'A.md', fileContent: makeContent('old', 57), fileLastModifiedAt: 1 },
        docLines,
      );

      act(() => {
        result.current.handleOpenFileAtLine('B.md', 56);
      });
      setProps({ selectedFilePath: 'B.md', fileContent: contentB, fileLastModifiedAt: 2 });
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(mockEditor.revealLineInCenter).toHaveBeenCalledWith(56);
    } finally {
      vi.useRealTimers();
    }
  });
});
