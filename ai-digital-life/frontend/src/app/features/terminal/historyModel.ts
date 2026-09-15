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
 * 零宽码点：组合标记（Mn/Me）与格式字符（Cf，含 ZWJ/ZWNJ/变体选择符）+ 零宽空格。
 * xterm 的 wcwidth 对它们返回 0 并把字符并入前一格；若这里按 1 计，
 * `👨‍👩‍👧` 这类序列会多出 2 格、带组合音标的文本会多 1 格，整行后续列全部右移。
 */
const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}\u200B]$/u;

/**
 * 单元格宽度判定（东亚宽字符占 2 格，零宽码点占 0 格）。
 * 口径与 xterm 的 wcwidth 一致；只覆盖终端里常见的宽字符区间，
 * 漏判只会让个别字符错 1 格，不会破坏换行正确性。
 */
export function cellWidthOf(char: string): 0 | 1 | 2 {
  const cp = char.codePointAt(0) ?? 0;
  if (ZERO_WIDTH.test(char)) {
    return 0;
  }
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

/**
 * 把一个 run 的文本切成「终端格」分组：基字符 + 紧随其后的零宽字符算一格。
 *
 * 这正是 xterm 的入格口径（零宽字符被并入前一格），因此**不能**改用 UAX#29 字素簇：
 * 字素簇会把 `👨‍👩‍👧` 合并成"一格（2 列）"，而我们的实时 xterm 未启用 grapheme 聚类，
 * 该序列在缓冲里是 3 个宽格（6 列）——历史必须跟实时对齐，故按格分组而非按字素簇。
 */
export function splitCellGroups(text: string): { text: string; width: number }[] {
  const groups: { text: string; width: number }[] = [];
  for (const ch of text) {
    const width = cellWidthOf(ch);
    const last = groups[groups.length - 1];
    if (width === 0 && last) {
      last.text += ch;
      continue;
    }
    groups.push({ text: ch, width });
  }
  return groups;
}

function explode(runs: HistoryRun[]): { text: string; width: number; run: HistoryRun }[] {
  const cells: { text: string; width: number; run: HistoryRun }[] = [];
  for (const run of runs) {
    for (const group of splitCellGroups(run.text)) {
      cells.push({ ...group, run });
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

function implode(cells: { text: string; run: HistoryRun }[]): HistoryRun[] {
  const out: HistoryRun[] = [];
  for (const cell of cells) {
    const last = out[out.length - 1];
    if (last && sameStyle(last, cell.run)) {
      last.text += cell.text;
    } else {
      out.push({ ...cell.run, text: cell.text });
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
    let current: { text: string; run: HistoryRun }[] = [];
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
  /** 前景是否为真彩色（xterm RGB 模式）：决定 getFgColor() 是调色板下标还是打包 0xRRGGBB */
  isFgRGB(): boolean;
  isBgDefault(): boolean;
  getBgColor(): number | string;
  isBgRGB(): boolean;
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

/** 真彩色打包值（0xRRGGBB）→ `#rrggbb` */
function rgbHex(value: number): string {
  return `#${(value >>> 0).toString(16).padStart(6, '0')}`;
}

/**
 * 粗体提亮：0–7 号标准色按 8–15 号亮色渲染（xterm `drawBoldTextInBrightColors` 默认开）。
 * `value >= 0` 不是冗余守卫：负值若不拦会被 `value < 8` 放行成 7，反而着色错误。
 */
function brightenBold(
  value: number | string | undefined,
  bold: boolean | undefined,
): number | string | undefined {
  return bold && typeof value === 'number' && value >= 0 && value < 8 ? value + 8 : value;
}

function styleOf(cell: ExtractCell): Omit<HistoryRun, 'text'> {
  const style: Omit<HistoryRun, 'text'> = {};
  if (!cell.isFgDefault()) {
    // 真彩色在缓冲里是打包的 0xRRGGBB（如纯蓝 #0000ff = 255），与调色板下标 0–255
    // 数值空间重叠，单看数值无法区分，必须按 xterm 的 color mode 定型；
    // 真彩色是绝对色（与主题无关），直接存成 hex 字符串。
    style.fg = cell.isFgRGB() ? rgbHex(cell.getFgColor() as number) : cell.getFgColor();
  }
  if (!cell.isBgDefault()) {
    style.bg = cell.isBgRGB() ? rgbHex(cell.getBgColor() as number) : cell.getBgColor();
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

/**
 * 行尾右裁：从末尾去掉「空白且不可见」的 run。
 * 保留两类可见空白：带非默认背景色的格（色块），以及反显（inverse）格
 * ——反显下显示的是前景色底，裁掉会丢失可见色块。
 */
function trimTrailingBlank(runs: HistoryRun[]): HistoryRun[] {
  const kept = runs.slice();
  while (kept.length > 0) {
    const last = kept[kept.length - 1];
    if (last.bg === undefined && !last.inverse) {
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
 * - **空白单元格必须还原成空格**：xterm 的空白格 `getChars()` 返回空串、宽度为 1，
 *   其 DOM 渲染器用 `getChars() || WHITESPACE_CELL_CHAR`（`" "`）回退渲染；
 *   提取若直接拼 `getChars()`，列间空白会全部消失，历史行被"压缩"、
 *   与实时终端的列对齐对不上（曾实测 `ls` 多列输出在历史里挤成一列）。
 *   宽度为 0 的格是宽字符的第二格占位，实时端渲染为 0 宽，不产出文本。
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
        // 与 xterm DOM 渲染器同口径：宽度 0 的格（宽字符第二格占位）直接跳过，
        // 其余一律 `getChars() || WHITESPACE_CELL_CHAR(" ")` —— 空白格还原为空格。
        if (cell.getWidth() === 0) {
          continue;
        }
        const chars = cell.getChars();
        const text = chars === '' ? ' ' : chars;
        const style = styleOf(cell);
        const last = runs[runs.length - 1];
        if (last && sameStyle(last, style as HistoryRun)) {
          last.text += text;
        } else {
          runs.push({ ...style, text });
        }
      }
    }
    out.push(trimTrailingBlank(runs));
  }
  return out;
}

/** 一个行块：一次追加写入的最小单位 */
export interface HistoryChunk {
  /** 块序号，从 0 起，按序拼接成一个段 */
  seq: number;
  /** 提取时的列数，作为折行基准 */
  cols: number;
  /** 本块包含的屏幕行，旧 → 新 */
  lines: HistoryRun[][];
}

export interface HistoryPalette {
  foreground: string;
  background: string;
  /** 16 个基础色：0–7 常规、8–15 亮色（readonly：调色板在多方共享，禁止被就地修改） */
  ansi: readonly string[];
}

export interface ResolvedRunStyle {
  color?: string;
  backgroundColor?: string;
  fontWeight?: number;
  /** 只能是这两个字面量：React 的 CSSProperties 不接受宽化 string */
  fontStyle?: 'italic';
  textDecoration?: 'underline';
}

/** 256 色表：16–231 为 6×6×6 立方，232–255 为灰阶 */
function palette256(index: number, palette: HistoryPalette): string {
  if (index < 16) {
    return palette.ansi[index] ?? palette.foreground;
  }
  if (index < 232) {
    const n = index - 16;
    const steps = [0, 95, 135, 175, 215, 255];
    const r = steps[Math.floor(n / 36) % 6];
    const g = steps[Math.floor(n / 6) % 6];
    const b = steps[n % 6];
    return `rgb(${r}, ${g}, ${b})`;
  }
  const gray = 8 + (index - 232) * 10;
  return `rgb(${gray}, ${gray}, ${gray})`;
}

function toColor(
  value: number | string | undefined,
  palette: HistoryPalette,
  fallback: string,
): string {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'number') {
    // 直接色（提取期已定型的真彩色 hex，或调用方给的 CSS 颜色）原样使用
    return value;
  }
  // number 恒为调色板下标 0–255：真彩色在提取期已按 color mode 定型为 hex 字符串
  return palette256(value, palette);
}

/**
 * 把语义样式解析成当前主题下的具体颜色。
 * 历史里存的是**语义值**（调色板下标 / 直接色），所以切换主题时历史会跟着正确重着色
 * —— 与实时终端共用同一套主题 token 的口径一致。
 * 粗体提亮：xterm 默认 `drawBoldTextInBrightColors: true`（所装版本默认值已核对），
 * 粗体的 0–7 号标准色按 8–15 号亮色渲染；此处同口径，否则粗体目录蓝等与实时不一致。
 * **顺序**：xterm 渲染器先做 inverse 交换、再对"交换后的前景"提亮
 * （lib 内 `$`/`G` 互换后才 `$ += 8`），所以提亮必须作用在有效前景上，
 * 否则 bold+inverse 会提亮错通道（背景被提亮、前景不提）。
 */
export function resolveRunStyle(run: HistoryRun, palette: HistoryPalette): ResolvedRunStyle {
  let style: ResolvedRunStyle;
  if (run.inverse) {
    // 交换后前景 = 原背景（提亮它），背景 = 原前景（不提亮）
    style = {
      color: toColor(brightenBold(run.bg, run.bold), palette, palette.background),
      backgroundColor: toColor(run.fg, palette, palette.foreground),
    };
  } else {
    style = { color: toColor(brightenBold(run.fg, run.bold), palette, palette.foreground) };
    if (run.bg !== undefined) {
      style.backgroundColor = toColor(run.bg, palette, palette.background);
    }
  }
  if (run.dim) {
    // xterm 的 dim 只降低**前景**不透明度（其 `.xterm-dim` 规则注释：不得影响背景），
    // 等价于把前景按 50% 混入其背后的颜色。用 CSS color-mix 表达，
    // 避免整格 opacity 连背景一起变淡（那会让带底色/反显的格与实时终端不一致）。
    const behind = run.inverse
      ? style.backgroundColor
      : (style.backgroundColor ?? palette.background);
    style.color = `color-mix(in srgb, ${style.color ?? palette.foreground} 50%, ${behind})`;
  }
  if (run.bold) {
    style.fontWeight = 700;
  }
  if (run.italic) {
    style.fontStyle = 'italic';
  }
  if (run.underline) {
    style.textDecoration = 'underline';
  }
  return style;
}
