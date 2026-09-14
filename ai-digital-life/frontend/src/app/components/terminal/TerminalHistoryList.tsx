import { useEffect, useMemo, useRef, useState } from 'react';
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

const OVERSCAN_ROWS = 40;
const FALLBACK_ROW_HEIGHT = 17;
const FALLBACK_CELL_WIDTH = 8;

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [cols, setCols] = useState(80);
  const [rowHeight, setRowHeight] = useState(FALLBACK_ROW_HEIGHT);
  const [chunks, setChunks] = useState<Map<string, HistoryRun[][]>>(new Map());

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
  }, [readCellMetrics]);

  const layout = useMemo(
    () =>
      buildLayout(
        segments,
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

  const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const lastVisible = Math.min(
    layout.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS,
  );

  /** 行号 → 所属段（段内块连续排布，按前缀和定位） */
  const ownerOf = useMemo(() => {
    const owners: (TerminalHistorySegment | undefined)[] = [];
    for (const segment of segments) {
      const blockRows = segment.chunks.reduce(
        (sum, _c, seq) => sum + (chunks.get(chunkKey(segment.sessionId, seq))?.length ?? segment.chunks[seq].lines),
        0,
      );
      for (let i = 0; i < blockRows + 1; i += 1) {
        owners.push(segment);
      }
    }
    return owners;
  }, [segments, chunks]);

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
        if (cancelled || raw === null) {
          continue;
        }
        let lines: HistoryRun[][];
        try {
          lines = wrapLines((JSON.parse(raw) as HistoryChunk).lines, cols);
        } catch {
          lines = [[{ text: unavailableLabel }]];
        }
        setChunks((prev) => new Map(prev).set(key, lines));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firstVisible, lastVisible, layout, ownerOf, cols, chunks, unavailableLabel]);

  // 初始定位到最底部（与旧 scrollToBottom 行为一致）
  useEffect(() => {
    const el = scrollRef.current;
    if (el && layout.length > 0) {
      el.scrollTop = el.scrollHeight;
    }
  }, [layout.length]);

  return (
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
                      ? (chunks.get(chunkKey(owner.sessionId, row.chunkIndex))?.[row.lineIndexInChunk] ??
                        EMPTY_RUNS)
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
  );
}
