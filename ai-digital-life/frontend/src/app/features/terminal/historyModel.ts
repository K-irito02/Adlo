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

export interface ExtractCell {
  getChars(): string;
  getWidth(): number;
  isFgDefault(): boolean;
  getFgColor(): number | string;
  isBgDefault(): boolean;
  getBgColor(): number | string;
  isBold(): boolean;
  isItalic(): boolean;
  isUnderline(): boolean;
  isDim(): boolean;
  isInverse(): boolean;
}

export interface ExtractLine {
  getCell(x: number): ExtractCell | undefined;
}

export interface ExtractSource {
  activeType: 'normal' | 'alternate';
  length: number;
  getLine(y: number): ExtractLine | undefined;
}

function styleOf(cell: ExtractCell): Omit<HistoryRun, 'text'> {
  const style: Omit<HistoryRun, 'text'> = {};
  if (!cell.isFgDefault()) {
    style.fg = cell.getFgColor();
  }
  if (!cell.isBgDefault()) {
    style.bg = cell.getBgColor();
  }
  if (cell.isBold()) {
    style.bold = true;
  }
  if (cell.isItalic()) {
    style.italic = true;
  }
  if (cell.isUnderline()) {
    style.underline = true;
  }
  if (cell.isDim()) {
    style.dim = true;
  }
  if (cell.isInverse()) {
    style.inverse = true;
  }
  return style;
}

/** 行尾右裁：从末尾去掉「空白且无背景色」的 run，但保留带背景色的单元格 */
function trimTrailingBlank(runs: HistoryRun[]): HistoryRun[] {
  const kept = runs.slice();
  while (kept.length > 0) {
    const last = kept[kept.length - 1];
    if (last.bg === undefined) {
      const trimmed = last.text.replace(/ +$/, '');
      if (trimmed === '') {
        kept.pop();
        continue;
      }
      if (trimmed !== last.text) {
        kept[kept.length - 1] = { ...last, text: trimmed };
      }
    }
    break;
  }
  return kept;
}

/**
 * 提取 `[fromRow, toRow)` 的行模型。
 *
 * - 备用缓冲区（vim/less）不进入历史：改读 `normal`，延续既有结论。
 * - 返回数组与请求区间一一对应，**空行保留为空数组**，行数信息不能丢。
 */
export function extractLines(
  buffer: { active: ExtractSource; normal: ExtractSource },
  fromRow: number,
  toRow: number,
): HistoryRun[][] {
  const source = buffer.active.activeType === 'alternate' ? buffer.normal : buffer.active;
  const out: HistoryRun[][] = [];
  for (let y = Math.max(0, fromRow); y < Math.min(toRow, source.length); y += 1) {
    const line = source.getLine(y);
    const runs: HistoryRun[] = [];
    if (line) {
      for (let x = 0; ; x += 1) {
        const cell = line.getCell(x);
        if (!cell) {
          break;
        }
        const style = styleOf(cell);
        const last = runs[runs.length - 1];
        if (last && sameStyle(last, style as HistoryRun)) {
          last.text += cell.getChars();
        } else {
          runs.push({ ...style, text: cell.getChars() });
        }
      }
    }
    out.push(trimTrailingBlank(runs));
  }
  return out;
}
