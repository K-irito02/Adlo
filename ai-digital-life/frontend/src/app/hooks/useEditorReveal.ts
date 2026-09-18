import { useCallback, useEffect, useRef } from 'react';
import type { DiagnosticSummary } from '@ai-digital-life/kernel';
import type { EditorRef, DiffEditorRef } from '../stores/types';
import { useAppStore } from '@stores/slicedStore';

/**
 * 行揭示。越界行会直接抛 RangeError 且上层无错误边界（曾致整应用空白，
 * 见 debug-logs.txt 2026-09-17 Invalid line number 268 in 57-line document）。
 *
 * 检索命中行相对当前内容可能 stale（检索后文件被改/换成别的版本），此时：
 * 不丢弃、不抛错，而是钳制到最近的有效行并告警——保证任何情况下都能落到可见位置。
 */
function revealLineSafely(editor: EditorRef, line: number, scope: string, path?: string): boolean {
  const lineCount = editor.getModel?.()?.getLineCount() ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(line)) {
    return false;
  }
  const finiteCount = Number.isFinite(lineCount) ? lineCount : null;
  let target = line;
  if (line < 1) {
    target = 1;
  } else if (finiteCount !== null && line > finiteCount) {
    target = finiteCount;
  }
  if (target !== line) {
    console.warn(
      `[useEditorReveal] stale reveal line clamped in ${scope}: requested=${line}, applied=${target}, lineCount=${finiteCount ?? 'unknown'}, path=${path ?? 'unknown'}`,
    );
  }
  editor.revealLineInCenter(target);
  editor.setPosition({ lineNumber: target, column: 1 });
  editor.focus();
  return true;
}

export function useEditorReveal(
  selectedFilePath: string | undefined,
  activeDiagnostic: DiagnosticSummary | undefined,
  fileLastModifiedAt: number | undefined,
  actions: {
    openFile: (relativePath: string) => Promise<void>;
  },
  pendingRevealRef: React.MutableRefObject<{ path: string; line: number } | null>,
  setPendingReveal: (path: string, line: number) => void,
  fileContent: string | undefined,
) {
  const standardEditorRef = useRef<EditorRef | null>(null);
  const diffEditorRef = useRef<EditorRef | DiffEditorRef | null>(null);

  // 最新文件快照（render 期同步），供同步揭示与 pending 依据读取；
  // 走 ref 而不进 useCallback 依赖，避免回调身份抖动引发面板重渲染。
  const latestFileRef = useRef({ selectedFilePath, fileContent, fileLastModifiedAt });
  latestFileRef.current = { selectedFilePath, fileContent, fileLastModifiedAt };
  // pending 依据：点击时刻的内容快照。openFile 中间态（路径已切新文件、
  // 内容仍是旧文件）下 modelFresh 会误判为"新鲜"，需用此快照识别并等待。
  const pendingBasisRef = useRef<{
    content: string | undefined;
    modifiedAt: number | undefined;
    alreadyOpen: boolean;
  } | null>(null);

  // 揭示代际：每次 dispatch 揭示即 +1，供延迟复核判定"是否已被更新的揭示取代"，
  // 防止旧定时器误伤新落点。
  const revealEpochRef = useRef(0);

  // 定位显隐（事项 46 调整项）：pending 跳转期间主区隐藏目标文件表面，
  // 揭示完成/放弃才显现，全程无中间态。守卫读取避免无谓重渲染。
  const setPositioning = useCallback((path: string | null) => {
    if (useAppStore.getState().positioningPath !== path) {
      useAppStore.getState().setPositioningPath(path);
    }
  }, []);

  useEffect(() => {
    if (!activeDiagnostic?.line) {
      return;
    }
    const raw = diffEditorRef.current ?? standardEditorRef.current;
    const editor =
      raw && 'getModifiedEditor' in raw ? (raw as DiffEditorRef).getModifiedEditor() : raw;
    if (!editor) {
      return;
    }
    revealEpochRef.current += 1;
    revealLineSafely(editor, activeDiagnostic.line, 'diagnostic', selectedFilePath);
  }, [activeDiagnostic, selectedFilePath]);

  // 记录 pending 的起始时刻，避免因模型迟迟不匹配而无限重试
  const pendingSinceRef = useRef<number | null>(null);
  // 兜底重试计时器（事项 46 缺口 2）：编辑器挂载（尤其首屏 lazy Suspense）
  // 不产生 store 变更，effect 依赖不变不会重跑，pending 会烂掉。
  const pendingRetryRef = useRef<number | undefined>(undefined);
  const pendingRetryStartRef = useRef<number>(0);

  const clearPendingRetry = useCallback(() => {
    if (pendingRetryRef.current !== undefined) {
      window.clearTimeout(pendingRetryRef.current);
      pendingRetryRef.current = undefined;
    }
  }, []);

  // 卸载时清理兜底计时器与定位隐藏（防残留 flag 导致表面永久隐藏）
  useEffect(
    () => () => {
      if (pendingRetryRef.current !== undefined) {
        window.clearTimeout(pendingRetryRef.current);
        pendingRetryRef.current = undefined;
      }
      if (useAppStore.getState().positioningPath !== null) {
        useAppStore.getState().setPositioningPath(null);
      }
    },
    [],
  );

  /**
   * 落点复核：延迟到布局稳定后，确认目标行确在可视区内；否则补一次揭示。
   * epoch 保证只有"最后一次揭示"的复核能生效，旧定时器不得误伤新落点。
   */
  const scheduleRevealVerify = useCallback(
    (editor: EditorRef, line: number, path: string, epoch: number) => {
      window.setTimeout(() => {
        if (epoch !== revealEpochRef.current) {
          return;
        }
        let visible = false;
        try {
          visible = editor
            .getVisibleRanges()
            .some((r) => r.startLineNumber <= line && line <= r.endLineNumber);
        } catch {
          return;
        }
        if (!visible) {
          // 注意：此处不 bump epoch——稳定性轮询需跨越 correction 继续观察，
          // bump 会误杀它；correction 本身 epoch 门控已保证只响应最后一次揭示。
          revealLineSafely(editor, line, 'correct', path);
        }
      }, 350);
    },
    [],
  );

  /**
   * 字体是否就绪：行高的 late 变化（字体加载/语言扩展/折叠计算）是揭示后
   * 视口漂移的主因，大行号会把像素误差放大成整屏。FontFaceSet.status 为
   * 'loading' 时视为未就绪；无此 API（jsdom/旧环境）视为就绪。
   */
  const POLL_CAP_MS = 3000;

  function areFontsSettled(): boolean {
    try {
      const status = document.fonts?.status;
      return status === undefined || status === 'loaded';
    } catch {
      return true;
    }
  }

  /**
   * 稳定性摘帘（事项 46 html:1439）：揭示后轮询目标行像素 top，连续两次不变
   * 且目标在可视区且字体就绪才摘帘；上限 3s 兜底显现，永不永久隐藏。
   * top 漂移或目标掉出可视区时重发揭示（追踪锚定，仍在帘后，不可见），
   * 遇新 pending 或 flag 易主即中止，不干扰后来的跳转。
   */
  const awaitStableReveal = useCallback(
    (editor: EditorRef, line: number, path: string, epoch: number) => {
      const startedAt = Date.now();
      let prevTop: number | null = null;
      const tick = () => {
        if (
          epoch !== revealEpochRef.current ||
          pendingRevealRef.current !== null ||
          useAppStore.getState().positioningPath !== path
        ) {
          return;
        }
        let top: number | null = null;
        let visible = false;
        try {
          top = editor.getTopForLineNumber?.(line) ?? null;
          visible = editor
            .getVisibleRanges()
            .some((r) => r.startLineNumber <= line && line <= r.endLineNumber);
        } catch {
          top = null;
        }
        if (
          top !== null &&
          Number.isFinite(top) &&
          visible &&
          prevTop !== null &&
          Math.abs(top - prevTop) < 0.5 &&
          areFontsSettled()
        ) {
          setPositioning(null);
          return;
        }
        if (top !== null && Number.isFinite(top)) {
          // 漂移中（与上次不同）或掉出可视区：重发揭示追踪锚定（仍在帘后）。
          if ((prevTop !== null && Math.abs(top - prevTop) >= 0.5) || !visible) {
            revealLineSafely(editor, line, 'track', path);
            prevTop = null;
          } else {
            prevTop = top;
          }
        }
        if (Date.now() - startedAt > POLL_CAP_MS) {
          setPositioning(null);
          return;
        }
        window.setTimeout(tick, 100);
      };
      window.setTimeout(tick, 100);
    },
    [pendingRevealRef, setPositioning],
  );

  /**
   * 尝试消费 pending：成功揭示或确认放弃时返回 true（调用方停止重试）。
   * effect 主路径与兜底计时器共用，条件完全一致。
   */
  const attemptPendingReveal = useCallback(() => {
    const snap = latestFileRef.current;
    const pending = pendingRevealRef.current;
    if (!pending) {
      pendingSinceRef.current = null;
      return true;
    }
    if (!snap.selectedFilePath || snap.selectedFilePath !== pending.path) {
      return false;
    }
    // 开文件失败：主区展示错误视图即终态，直接放弃 pending 并显现（事项 46 调整项）。
    if (useAppStore.getState().fileOpenError?.path === pending.path) {
      pendingRevealRef.current = null;
      pendingBasisRef.current = null;
      pendingSinceRef.current = null;
      setPositioning(null);
      return true;
    }
    const raw = diffEditorRef.current ?? standardEditorRef.current;
    const editor =
      raw && 'getModifiedEditor' in raw ? (raw as DiffEditorRef).getModifiedEditor() : raw;
    if (!editor) {
      return false;
    }
    // 销毁/游离视图（失败后错误视图替换了编辑器等）：不得 dispatch，等待挂载或超时放弃。
    if (editor.getDomNode?.()?.isConnected === false) {
      return false;
    }
    // 中间态守卫（事项 46）：路径已切但内容仍是点击时刻的旧文件时，
    // modelFresh 也会通过（两者同 stale），必须等待新内容到达才揭示。
    const basis = pendingBasisRef.current;
    if (
      basis &&
      !basis.alreadyOpen &&
      snap.fileContent === basis.content &&
      snap.fileLastModifiedAt === basis.modifiedAt
    ) {
      return false;
    }
    // 切换文件时 editor 可能仍挂着上一个文档的模型（日志实证：
    // 目标行 421 却 lineCount=128），此时不能当作"越界"丢弃，而应等待新模型挂载。
    const model = editor.getModel?.();
    const lineCount = model?.getLineCount();
    const expectedLines =
      snap.fileContent === undefined ? undefined : snap.fileContent.split('\n').length;
    const modelFresh =
      expectedLines === undefined ||
      lineCount === undefined ||
      Math.abs(lineCount - expectedLines) <= 1;
    if (!modelFresh) {
      const since = pendingSinceRef.current ?? Date.now();
      pendingSinceRef.current = since;
      if (Date.now() - since > 3000) {
        console.warn(
          `[useEditorReveal] give up stale pending reveal: line=${pending.line}, modelLines=${lineCount}, expected=${expectedLines}`,
        );
        pendingRevealRef.current = null;
        pendingBasisRef.current = null;
        pendingSinceRef.current = null;
        setPositioning(null);
        return true;
      }
      return false;
    }
    revealLineSafely(editor, pending.line, 'pending', pending.path);
    const epoch = (revealEpochRef.current += 1);
    // 落点复核（事项 46 症状②）：新挂载未量测的视图上 dispatch 的 scrollIntoView
    // 会按零高度布局解析、视口落错；350ms 待布局稳定后复核，不在可视区则补一次。
    scheduleRevealVerify(editor, pending.line, pending.path, epoch);
    // 稳定性摘帘：帘子保持到布局稳定（目标像素 top 不再漂移）才显现，
    // 而不是揭示 dispatch 即显现——否则用户会看到漂移中的视口。
    awaitStableReveal(editor, pending.line, pending.path, epoch);
    pendingRevealRef.current = null;
    pendingBasisRef.current = null;
    pendingSinceRef.current = null;
    return true;
  }, [pendingRevealRef, scheduleRevealVerify, awaitStableReveal, setPositioning]);

  useEffect(() => {
    if (attemptPendingReveal()) {
      clearPendingRetry();
    }
  }, [
    fileContent,
    fileLastModifiedAt,
    selectedFilePath,
    pendingRevealRef,
    attemptPendingReveal,
    clearPendingRetry,
  ]);

  const handleOpenFileAtLine = useCallback(
    (relativePath: string, line: number) => {
      const snap = latestFileRef.current;
      const alreadyOpen = snap.selectedFilePath === relativePath && snap.fileContent !== undefined;
      if (alreadyOpen) {
        // 文件已打开：编辑器即目标实例，直接揭示（此前走 pending 会因
        // effect 依赖无变化而永不触发，事项 46）。
        const raw = diffEditorRef.current ?? standardEditorRef.current;
        const editor =
          raw && 'getModifiedEditor' in raw
            ? (raw as DiffEditorRef).getModifiedEditor()
            : (raw as EditorRef | null);
        const lineCount = editor?.getModel?.()?.getLineCount();
        const expectedLines = snap.fileContent!.split('\n').length;
        if (editor && lineCount !== undefined && Math.abs(lineCount - expectedLines) <= 1) {
          revealEpochRef.current += 1;
          revealLineSafely(editor, line, 'direct', relativePath);
          setPositioning(null);
          return;
        }
        // 瞬态不一致（模型正在切换）：走 pending，alreadyOpen 标记保证后续放行。
      }
      setPendingReveal(relativePath, line);
      pendingBasisRef.current = {
        content: snap.fileContent,
        modifiedAt: snap.fileLastModifiedAt,
        alreadyOpen,
      };
      // 定位期间隐藏目标文件表面，揭示完成/放弃才显现（事项 46 调整项）。
      setPositioning(relativePath);
      // 兜底链：仅 pending 未被 effect 消费时生效（挂载无 store 变更等缺口），
      // 上限 3s，与既有 give-up 语义一致；消费成功即停，不空转。
      // 步进 120ms：首跳 dwell 越短，冷启动中间态越不可见。
      clearPendingRetry();
      pendingRetryStartRef.current = Date.now();
      const tickRetry = () => {
        pendingRetryRef.current = undefined;
        if (!pendingRevealRef.current) {
          return;
        }
        if (attemptPendingReveal()) {
          return;
        }
        if (Date.now() - pendingRetryStartRef.current > 3000) {
          pendingRevealRef.current = null;
          pendingBasisRef.current = null;
          pendingSinceRef.current = null;
          setPositioning(null);
          return;
        }
        pendingRetryRef.current = window.setTimeout(tickRetry, 120);
      };
      pendingRetryRef.current = window.setTimeout(tickRetry, 120);
      void actions.openFile(relativePath);
    },
    [
      actions,
      setPendingReveal,
      pendingRevealRef,
      attemptPendingReveal,
      clearPendingRetry,
      setPositioning,
    ],
  );

  const handleDiffMount = useCallback((editor: EditorRef | DiffEditorRef) => {
    diffEditorRef.current = editor;
  }, []);

  return {
    standardEditorRef,
    diffEditorRef,
    handleOpenFileAtLine,
    handleDiffMount,
  };
}
