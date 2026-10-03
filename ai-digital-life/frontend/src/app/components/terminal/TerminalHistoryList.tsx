import { useEffect, useMemo, useRef, useState } from 'react';
import { useRevealScrollbar } from '@hooks/useRevealScrollbar';
import { TerminalHistoryRow } from './TerminalHistoryRow';
import { TerminalHistoryDivider, formatDividerTime } from './TerminalHistoryDivider';
import { buildLayout } from '@features/terminal/historyLayout';
import { chunkKey, type TerminalHistorySegment } from '@features/terminal/terminalHistoryStore';
import { terminalOutputStore } from '@features/terminal/terminalOutputStore';
import {
  wrapLines,
  type HistoryChunk,
  type HistoryPalette,
  type HistoryRun,
} from '@features/terminal/historyModel';
import { FALLBACK_CELL_HEIGHT, FALLBACK_CELL_WIDTH } from '@features/terminal/terminalXtermPool';

const OVERSCAN_ROWS = 40;
// 兜底 cell 度量复用实时终端池的常量（两处各写一份迟早漂移）；
// FALLBACK_ROW_HEIGHT 同时用作「实测高度是否已落定」的哨兵值。
const FALLBACK_ROW_HEIGHT = FALLBACK_CELL_HEIGHT;

/**
 * 稳定的空 run 数组：未加载的行一律复用这一个引用，避免每个渲染帧都喂
 * `TerminalHistoryRow`（React.memo）一个全新的 `[]` 而让 memo 失效。
 */
const EMPTY_RUNS: HistoryRun[] = [];

/**
 * 只读历史的虚拟滚动容器。
 *
 * 与旧 TerminalHistoryView 的根本差别：不再用一个 xterm 回放全部历史
 * （xterm 按 rows 预分配行缓冲与画布，单段千行就已是百 MB 量级），
 * 而是把行摊平成 DOM 文本、只挂载视口附近的行。
 */
export function TerminalHistoryList({
  segments,
  palette,
  readCellMetrics,
  unavailableLabel,
}: {
  segments: TerminalHistorySegment[];
  palette: HistoryPalette;
  /** 从实时终端 DOM 实测 cell 宽高，保证两侧视觉延续 */
  readCellMetrics: () => { cellWidth: number; cellHeight: number };
  unavailableLabel: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [cols, setCols] = useState(80);
  const [rowHeight, setRowHeight] = useState(FALLBACK_ROW_HEIGHT);
  const [chunks, setChunks] = useState<Map<string, HistoryRun[][]>>(new Map());

  const layout = useMemo(
    () =>
      buildLayout(
        segments,
        // wrappedLinesOf：未加载的块回退到 meta.lines（采集时刻的屏幕行数），
        // 加载完成后再用真实内容折行得到的行数覆盖它。二者在
        // 「当前面板列数 ≠ 采集时列数」时可以不同，所以「加载一个块」可能改变
        // layout.length。这种高度纠正是 Finding 3 的锚定逻辑负责吸收的 —— 块加载
        // 时视图不跳到底部、滚动位置保持，于是行数变化对用户无感。
        (sessionId, seq) => {
          const loaded = chunks.get(chunkKey(sessionId, seq));
          if (loaded) {
            return loaded.length;
          }
          const segment = segments.find((s) => s.sessionId === sessionId);
          return segment?.chunks[seq]?.lines ?? 0;
        },
        cols,
      ),
    [segments, chunks, cols],
  );

  // 滚动条几何/拖拽复用项目通用 hook，thumb 样式自绘成 xterm 自绘条同款
  //（区域悬停 3px 细线、悬停滑块 14px 直角宽块，见 terminal-panel.css）。
  // deps 必须传标量：hook 内部把 deps join 成字符串比较，传 Map/数组会退化成
  // "[object Map]" 而永远测不到内容变化 → 块加载后滚动区变高也不重测。
  const scrollbar = useRevealScrollbar([layout.length, rowHeight]);
  const scrollRef = scrollbar.scrollRef;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const remeasure = () => {
      const metrics = readCellMetrics();
      const cellHeight = metrics.cellHeight || FALLBACK_ROW_HEIGHT;
      const cellWidth = metrics.cellWidth || FALLBACK_CELL_WIDTH;
      // F6：把实测 cell 度量写进滚动容器，DOM 行高（CSS 读取 --adl-terminal-cell-height）
      // 与虚拟化偏移（整数乘法）必须用同一份数值，否则两侧错位、行漂移。
      el.style.setProperty('--adl-terminal-cell-height', `${cellHeight}px`);
      el.style.setProperty('--adl-terminal-cell-width', `${cellWidth}px`);
      setRowHeight(cellHeight);
      setCols(Math.max(1, Math.floor(el.clientWidth / cellWidth)));
      setViewportHeight(el.clientHeight);
    };
    remeasure();
    const observer = new ResizeObserver(remeasure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [readCellMetrics, scrollRef]);

  const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const lastVisible = Math.min(
    layout.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS,
  );

  /** 行号 → 所属段（段内块连续排布，按前缀和定位） */
  const ownerOf = useMemo(() => {
    const owners: (TerminalHistorySegment | undefined)[] = [];
    for (const segment of segments) {
      // 与 buildLayout 同口径跳过空段：它不产出行，这里若仍占位会让后续
      // 行号与段错位（行拿到错误段的块键 → 渲染成空白/错内容）。
      if (segment.chunks.length === 0) {
        continue;
      }
      const blockRows = segment.chunks.reduce(
        (sum, _c, seq) =>
          sum + (chunks.get(chunkKey(segment.sessionId, seq))?.length ?? segment.chunks[seq].lines),
        0,
      );
      for (let i = 0; i < blockRows + 1; i += 1) {
        owners.push(segment);
      }
    }
    return owners;
  }, [segments, chunks]);

  // 段级稳定键：只有「段集合本身」变化（首屏挂载 / 历史被删 / 追加新段）才会改变。
  // 单个块加载完成、或 resize 后重新折行，都不会改变这个键 —— 那些情况应保持
  // 当前滚动位置，不应跳到底部（见 §6.3 的「锚定」要求）。
  const segmentKey = useMemo(
    () =>
      segments
        .map(
          (s) =>
            `${s.sessionId}|${s.chunks.map((_c, seq) => chunkKey(s.sessionId, seq)).join(',')}`,
        )
        .join(';'),
    [segments],
  );

  // 块级懒加载：视口内的块才 load → parse → 按 cols 折行
  useEffect(() => {
    let cancelled = false;
    const needed = new Set<string>();
    for (let i = firstVisible; i < lastVisible; i += 1) {
      const row = layout[i];
      const owner = ownerOf[i];
      if (row && owner && row.kind === 'line') {
        needed.add(chunkKey(owner.sessionId, row.chunkIndex));
      }
    }
    void (async () => {
      for (const key of needed) {
        if (cancelled || chunks.has(key)) {
          continue;
        }
        const raw = await terminalOutputStore.load(key);
        if (cancelled) {
          continue;
        }
        let lines: HistoryRun[][];
        if (raw === null) {
          // 内容确实缺失（非解析失败）：渲染「不可用」占位行，而非留空行。
          // 与解析失败走同一个占位形态，文案由 unavailableLabel 注入，不硬编码。
          lines = [[{ text: unavailableLabel }]];
        } else {
          try {
            lines = wrapLines((JSON.parse(raw) as HistoryChunk).lines, cols);
          } catch {
            lines = [[{ text: unavailableLabel }]];
          }
        }
        setChunks((prev) => new Map(prev).set(key, lines));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firstVisible, lastVisible, layout, ownerOf, cols, chunks, unavailableLabel]);

  // 定位到底部 —— 区分「段集合变化」与「块加载 / resize」两种 layout 变化来源：
  //  - segmentChanged：首屏 / 追加 / 删除 → 落到最新内容；
  //  - firstMeasurement：实测高度首次落定（rowHeight 从 fallback 变为真实值）→ Finding 1
  //    纠正上一帧用 fallback 高度算出的 stale scrollTop，避免在列表中部打开历史；
  //  - 之后 resize 再次改变 rowHeight、或某个块加载完成导致 layout.length 变化 → 均不跳
  //    （保持视图位置，避免把用户从中间「拽」到底部，§6.3 锚定要求）。
  const prevSegmentKey = useRef<string | null>(null);
  const prevRowHeight = useRef<number>(FALLBACK_ROW_HEIGHT);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || layout.length === 0) {
      return;
    }
    const segmentChanged = prevSegmentKey.current !== segmentKey;
    const firstMeasurement =
      prevRowHeight.current === FALLBACK_ROW_HEIGHT && rowHeight !== FALLBACK_ROW_HEIGHT;
    if (segmentChanged || firstMeasurement) {
      el.scrollTop = el.scrollHeight;
    }
    prevSegmentKey.current = segmentKey;
    prevRowHeight.current = rowHeight;
    // scrollRef 来自 hook（useRef 实例，恒定）——列入 deps 只为满足 lint 对「非 useRef 直取」的判定。
  }, [segmentKey, rowHeight, layout.length, viewportHeight, scrollRef]);

  return (
    <div className="adl-terminal-history-scroll-host" {...scrollbar.hoverProps}>
      <div
        ref={scrollRef}
        className="adl-terminal-history-list"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div
          className="adl-terminal-history-list__spacer"
          style={{ height: layout.length * rowHeight }}
        >
          {layout.slice(firstVisible, lastVisible).map((row, index) => {
            const absolute = firstVisible + index;
            const owner = ownerOf[absolute];
            return (
              <div
                key={absolute}
                className="adl-terminal-history-list__row"
                style={{ top: absolute * rowHeight }}
              >
                {row.kind === 'divider' ? (
                  <TerminalHistoryDivider at={row.at} label={formatDividerTime} />
                ) : (
                  <TerminalHistoryRow
                    runs={
                      owner
                        ? (chunks.get(chunkKey(owner.sessionId, row.chunkIndex))?.[
                            row.lineIndexInChunk
                          ] ?? EMPTY_RUNS)
                        : EMPTY_RUNS
                    }
                    palette={palette}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="adl-terminal-histscroll" data-visible={scrollbar.visible} aria-hidden="true">
        <div
          className="adl-terminal-histscroll__thumb"
          style={scrollbar.thumbStyle}
          {...scrollbar.thumbListeners}
        />
      </div>
    </div>
  );
}
