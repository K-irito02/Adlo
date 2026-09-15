import type { TerminalHistorySegment } from './terminalHistoryStore';

export interface LayoutRow {
  kind: 'line' | 'divider';
  /** 行类：所属块在段内的下标（即 seq） */
  chunkIndex: number;
  /** 行类：折行后在块内的显示行下标 */
  lineIndexInChunk: number;
  /** 分隔符：该段结束时刻 */
  at: number;
}

/**
 * 把「段 → 块 → 显示行」摊平成一条虚拟列表的行序列。
 *
 * 行高固定，所以布局只需要行数与顺序 —— 由块的 `lines` 与按当前 cols 折行后的
 * 行数算出，不必加载块内容。分隔符作为独立行项跟在所属段之后。
 */
export function buildLayout(
  segments: TerminalHistorySegment[],
  wrappedLinesOf: (sessionId: string, seq: number, cols: number) => number,
  cols: number,
): LayoutRow[] {
  const rows: LayoutRow[] = [];
  for (const segment of segments) {
    // 空段无任何可渲染行：跳过（否则会产出孤立日期分隔符）。上游四层已保证
    // 空段到不了这里，此为导出纯函数的最后一道防御，防未来新调用方重蹈覆辙。
    if (segment.chunks.length === 0) {
      continue;
    }
    segment.chunks.forEach((_meta, seq) => {
      const count = wrappedLinesOf(segment.sessionId, seq, cols);
      for (let i = 0; i < count; i += 1) {
        rows.push({ kind: 'line', chunkIndex: seq, lineIndexInChunk: i, at: segment.endedAt });
      }
    });
    rows.push({ kind: 'divider', chunkIndex: -1, lineIndexInChunk: -1, at: segment.endedAt });
  }
  return rows;
}
