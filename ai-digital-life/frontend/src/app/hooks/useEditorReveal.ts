import { useCallback, useEffect, useRef } from 'react';
import type { DiagnosticSummary } from '@ai-digital-life/kernel';
import type { EditorRef, DiffEditorRef } from '../stores/types';
import { useAppStore } from '@stores/slicedStore';

// 揭示时序常数（事项 46；集中命名，调参只改此处）。
const VERIFY_DELAY_MS = 350;
const RETRY_STEP_MS = 120;
const RETRY_CAP_MS = 3000;
const STABLE_STEP_MS = 100;
const STABLE_CAP_MS = 3000;

/**
 * 行揭示。越界行会直接抛 RangeError 且上层无错误边界（曾致整应用空白，
 * 见 debug-logs.txt 2026-09-17 Invalid line number 268 in 57-line document）。
 *
 * 检索命中行相对当前内容可能 stale（检索后文件被改/换成别的版本），此时：
 * 不丢弃、不抛错，而是钳制到最近的有效行并告警——保证任何情况下都能落到可见位置。
 */
function revealLineSafely(
  editor: EditorRef,
  line: number,
  scope: string,
  path?: string,
  opts?: { focus?: boolean },
): boolean {
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
  if (opts?.focus ?? true) {
    editor.focus();
  }
  return true;
}

/**
 * 字体是否就绪：行高的 late 变化（字体加载/语言扩展/折叠计算）是揭示后
 * 视口漂移的主因，大行号会把像素误差放大成整屏。FontFaceSet.status 为
 * 'loading' 时视为未就绪；无此 API（jsdom/旧环境）视为就绪。
 */
function areFontsSettled(): boolean {
  try {
    const status = document.fonts?.status;
    return status === undefined || status === 'loaded';
  } catch {
    return true;
  }
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

  // 最新文件快照。render 期同步是有意为之：handleOpenFileAtLine 必须读到
  // 本次点击对应的最新 store 值；若移入 effect，回调将读到上一帧快照。
  const latestFileRef = useRef({ selectedFilePath, fileContent, fileLastModifiedAt });
  latestFileRef.current = { selectedFilePath, fileContent, fileLastModifiedAt };
  // pending 依据：点击时刻的内容快照。openFile 中间态（路径已切新文件、
  // 内容仍是旧文件）下 modelFresh 会误判为"新鲜"，需用此快照识别并等待。
  // path 用于区分"旧内容滞留"与"新内容恰好相同"（同内容跨文件不等待）。
  const pendingBasisRef = useRef<{
    path: string | undefined;
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
  // 本实例拥有的帘子：卸载时只清自己置的，不碰后来者（Phase 4 审查 3.2）。
  const ownedPositioningRef = useRef<string | null>(null);
  const setOwnedPositioning = useCallback(
    (path: string) => {
      ownedPositioningRef.current = path;
      setPositioning(path);
    },
    [setPositioning],
  );
  const clearOwnedPositioning = useCallback(() => {
    ownedPositioningRef.current = null;
    setPositioning(null);
  }, [setPositioning]);

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
  // 落点复核 / 稳定性轮询计时器（Phase 4 审查 1.5）：跟踪 ID，卸载与
  // 新跳转时显式取消，不靠 epoch 自然死亡。
  const verifyTimerRef = useRef<number | undefined>(undefined);
  const stableTimerRef = useRef<number | undefined>(undefined);

  const clearPendingRetry = useCallback(() => {
    if (pendingRetryRef.current !== undefined) {
      window.clearTimeout(pendingRetryRef.current);
      pendingRetryRef.current = undefined;
    }
  }, []);
  const clearVerifyTimer = useCallback(() => {
    if (verifyTimerRef.current !== undefined) {
      window.clearTimeout(verifyTimerRef.current);
      verifyTimerRef.current = undefined;
    }
  }, []);
  const clearStableTimer = useCallback(() => {
    if (stableTimerRef.current !== undefined) {
      window.clearTimeout(stableTimerRef.current);
      stableTimerRef.current = undefined;
    }
  }, []);
  const clearRevealTimers = useCallback(() => {
    clearPendingRetry();
    clearVerifyTimer();
    clearStableTimer();
  }, [clearPendingRetry, clearVerifyTimer, clearStableTimer]);

  // 卸载时清理全部计时器与本实例拥有的定位隐藏（防残留 flag 导致表面永久隐藏）
  useEffect(
    () => () => {
      clearRevealTimers();
      const owned = ownedPositioningRef.current;
      if (owned !== null && useAppStore.getState().positioningPath === owned) {
        useAppStore.getState().setPositioningPath(null);
      }
      ownedPositioningRef.current = null;
    },
    [clearRevealTimers],
  );

  /**
   * 落点复核：延迟到布局稳定后，确认目标行确在可视区内；否则补一次揭示。
   * epoch 保证只有"最后一次揭示"的复核能生效，旧定时器不得误伤新落点。
   */
  const scheduleRevealVerify = useCallback(
    (editor: EditorRef, line: number, path: string, epoch: number) => {
      clearVerifyTimer();
      verifyTimerRef.current = window.setTimeout(() => {
        verifyTimerRef.current = undefined;
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
      }, VERIFY_DELAY_MS);
    },
    [clearVerifyTimer],
  );

  /**
   * 稳定性摘帘（事项 46 html:1439）：揭示后轮询目标行像素 top，连续两次不变
   * 且目标在可视区且字体就绪才摘帘；上限兜底显现，永不永久隐藏。
   * top 漂移或目标掉出可视区时重发揭示（追踪锚定，仍在帘后，不可见，
   * 且不抢焦点，摘帘时首揭示的 focus 早已生效），
   * 遇新 pending 或 flag 易主即中止，不干扰后来的跳转。
   */
  const awaitStableReveal = useCallback(
    (editor: EditorRef, line: number, path: string, epoch: number) => {
      clearStableTimer();
      const startedAt = Date.now();
      let prevTop: number | null = null;
      const tick = () => {
        stableTimerRef.current = undefined;
        if (epoch !== revealEpochRef.current || pendingRevealRef.current !== null) {
          // 被取代（diagnostic bump/新 pending）：若帘子仍在自己名下则显现，
          // 否则表面永久隐藏（Phase 4 审查 1.4）。
          if (useAppStore.getState().positioningPath === path) {
            clearOwnedPositioning();
          }
          return;
        }
        if (useAppStore.getState().positioningPath !== path) {
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
          clearOwnedPositioning();
          return;
        }
        if (top !== null && Number.isFinite(top)) {
          // 漂移中（与上次不同）或掉出可视区：重发揭示追踪锚定（仍在帘后）。
          if ((prevTop !== null && Math.abs(top - prevTop) >= 0.5) || !visible) {
            revealLineSafely(editor, line, 'track', path, { focus: false });
            prevTop = null;
          } else {
            prevTop = top;
          }
        }
        if (Date.now() - startedAt > STABLE_CAP_MS) {
          clearOwnedPositioning();
          return;
        }
        stableTimerRef.current = window.setTimeout(tick, STABLE_STEP_MS);
      };
      stableTimerRef.current = window.setTimeout(tick, STABLE_STEP_MS);
    },
    [clearStableTimer, clearOwnedPositioning, pendingRevealRef],
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
      clearOwnedPositioning();
      return true;
    }
    const raw = diffEditorRef.current ?? standardEditorRef.current;
    const editor =
      raw && 'getModifiedEditor' in raw ? (raw as DiffEditorRef).getModifiedEditor() : raw;
    if (!editor) {
      return false;
    }
    // 销毁/游离视图（失败后错误视图替换了编辑器等）：不得 dispatch，等待挂载或超时放弃。
    let connected = true;
    try {
      connected = editor.getDomNode?.()?.isConnected !== false;
    } catch {
      connected = false;
    }
    if (!connected) {
      return false;
    }
    // 中间态守卫（事项 46）：路径已切但内容仍是点击时刻的旧文件时，
    // modelFresh 也会通过（两者同 stale），必须等待新内容到达才揭示。
    // 仅当确实切了文件（basis.path !== pending.path）才等待——新内容恰好
    // 与旧内容相同时不误伤（Phase 4 审查 1.2）；比较按 mtime→长度→内容
    // 由廉到贵短路（Phase 4 审查 3.1）。
    const basis = pendingBasisRef.current;
    if (
      basis &&
      !basis.alreadyOpen &&
      basis.path !== pending.path &&
      snap.fileLastModifiedAt === basis.modifiedAt &&
      (snap.fileContent?.length ?? -1) === (basis.content?.length ?? -2) &&
      snap.fileContent === basis.content
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
      if (Date.now() - since > RETRY_CAP_MS) {
        console.warn(
          `[useEditorReveal] give up stale pending reveal: line=${pending.line}, modelLines=${lineCount}, expected=${expectedLines}`,
        );
        pendingRevealRef.current = null;
        pendingBasisRef.current = null;
        pendingSinceRef.current = null;
        clearOwnedPositioning();
        return true;
      }
      return false;
    }
    revealLineSafely(editor, pending.line, 'pending', pending.path);
    const epoch = (revealEpochRef.current += 1);
    // 落点复核（事项 46 症状②）：新挂载未量测的视图上 dispatch 的 scrollIntoView
    // 会按零高度布局解析、视口落错；待布局稳定后复核，不在可视区则补一次。
    scheduleRevealVerify(editor, pending.line, pending.path, epoch);
    // 稳定性摘帘：帘子保持到布局稳定（目标像素 top 不再漂移）才显现，
    // 而不是揭示 dispatch 即显现——否则用户会看到漂移中的视口。
    awaitStableReveal(editor, pending.line, pending.path, epoch);
    pendingRevealRef.current = null;
    pendingBasisRef.current = null;
    pendingSinceRef.current = null;
    return true;
  }, [scheduleRevealVerify, awaitStableReveal, clearOwnedPositioning, pendingRevealRef]);

  /**
   * 兜底链：仅 pending 未被 effect 消费时生效（挂载无 store 变更等缺口），
   * 上限与 give-up 语义一致；消费成功即停，不空转。
   * 步进 120ms：首跳 dwell 越短，冷启动中间态越不可见。
   */
  const startRetryChain = useCallback(() => {
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
      if (Date.now() - pendingRetryStartRef.current > RETRY_CAP_MS) {
        pendingRevealRef.current = null;
        pendingBasisRef.current = null;
        pendingSinceRef.current = null;
        clearOwnedPositioning();
        return;
      }
      pendingRetryRef.current = window.setTimeout(tickRetry, RETRY_STEP_MS);
    };
    pendingRetryRef.current = window.setTimeout(tickRetry, RETRY_STEP_MS);
  }, [attemptPendingReveal, clearPendingRetry, clearOwnedPositioning, pendingRevealRef]);

  useEffect(() => {
    if (attemptPendingReveal()) {
      clearPendingRetry();
    } else if (pendingRetryRef.current === undefined) {
      // 非 handleOpenFileAtLine 生产的 pending（如补丁 hunk 直调）同样需要兜底：
      // 无运行中链条时惰性启动一条（Phase 4 审查 1.6）。
      startRetryChain();
    }
  }, [
    fileContent,
    fileLastModifiedAt,
    selectedFilePath,
    attemptPendingReveal,
    clearPendingRetry,
    startRetryChain,
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
          const epoch = (revealEpochRef.current += 1);
          revealLineSafely(editor, line, 'direct', relativePath);
          // 已打开视图同样可能 late 漂移：复核纠偏（不进帘，视图本就可见）。
          scheduleRevealVerify(editor, line, relativePath, epoch);
          clearOwnedPositioning();
          return;
        }
        // 瞬态不一致（模型正在切换）：走 pending，alreadyOpen 标记保证后续放行。
      }
      setPendingReveal(relativePath, line);
      pendingBasisRef.current = {
        path: snap.selectedFilePath,
        content: snap.fileContent,
        modifiedAt: snap.fileLastModifiedAt,
        alreadyOpen,
      };
      // 定位期间隐藏目标文件表面，揭示完成/放弃才显现（事项 46 调整项）。
      // 旧链条显式取消，不靠 epoch 自然死亡（Phase 4 审查 1.5）。
      clearRevealTimers();
      setOwnedPositioning(relativePath);
      startRetryChain();
      void actions.openFile(relativePath);
    },
    [
      actions,
      setPendingReveal,
      clearRevealTimers,
      setOwnedPositioning,
      startRetryChain,
      scheduleRevealVerify,
      clearOwnedPositioning,
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
