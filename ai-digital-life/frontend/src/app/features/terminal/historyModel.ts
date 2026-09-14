/** 一行中的一个同样式片段 */
export interface HistoryRun {
  text: string;
  /** 缺省 = 默认前景；number = 调色板下标 (0–255)；string = 直接颜色 */
  fg?: number | string;
  bg?: number | string;
  bold?: true;
  italic?: true;
  underline?: true;
  dim?: true;
  inverse?: true;
}

/**
 * 单元格宽度判定（东亚宽字符占 2 格）。
 * 口径与 xterm 的 wcwidth 一致；只覆盖终端里常见的宽字符区间，
 * 漏判只会让个别字符错 1 格，不会破坏换行正确性。
 */
export function cellWidthOf(char: string): 1 | 2 {
  const cp = char.codePointAt(0) ?? 0;
  const wide =
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff01 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x20000 && cp <= 0x3fffd);
  return wide ? 2 : 1;
}

function explode(runs: HistoryRun[]): { ch: string; width: 1 | 2; run: HistoryRun }[] {
  const cells: { ch: string; width: 1 | 2; run: HistoryRun }[] = [];
  for (const run of runs) {
    for (const ch of run.text) {
      cells.push({ ch, width: cellWidthOf(ch), run });
    }
  }
  return cells;
}

function sameStyle(a: HistoryRun, b: HistoryRun): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.dim === !!b.dim &&
    !!a.inverse === !!b.inverse
  );
}

function implode(cells: { ch: string; run: HistoryRun }[]): HistoryRun[] {
  const out: HistoryRun[] = [];
  for (const cell of cells) {
    const last = out[out.length - 1];
    if (last && sameStyle(last, cell.run)) {
      last.text += cell.ch;
    } else {
      out.push({ ...cell.run, text: cell.ch });
    }
  }
  return out;
}

/**
 * 按列数把屏幕行折成显示行。
 *
 * 为什么自实现而不用 CSS 自动换行：终端是「每 cols 列硬折行」，CSS 会在空格处断行，
 * 两者对不上；而且显示行数不一致会让虚拟化的行偏移与滚动条失真。
 * 宽字符跨列边界时不切开，整体推到下一显示行（与终端行为一致）。
 */
export function wrapLines(lines: HistoryRun[][], cols: number): HistoryRun[][] {
  if (cols <= 0) {
    return lines;
  }
  const out: HistoryRun[][] = [];
  for (const line of lines) {
    let current: { ch: string; run: HistoryRun }[] = [];
    let used = 0;
    for (const cell of explode(line)) {
      if (used + cell.width > cols && current.length > 0) {
        out.push(implode(current));
        current = [];
        used = 0;
      }
      current.push(cell);
      used += cell.width;
    }
    out.push(implode(current));
  }
  return out;
}
