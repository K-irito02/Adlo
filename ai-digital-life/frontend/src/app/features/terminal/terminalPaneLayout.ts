import { readJson } from '@stores/storageHelpers';
import { persist } from '@stores/persisted/persist';

/**
 * 按**标签 id** 持久化的多窗格终端布局模型与纯函数数学。
 *
 * 模型（spec §5.2）：
 * - `equal`：CSS Grid，`colFractions`/`rowFractions` 为各列/行比例（总和 1）；
 * - `free`：窗格绝对定位，`rects` 为归一化 0..1 矩形，随容器等比缩放。
 *
 * 网格排布为行主序的 `cols×rows`（Ruling C-2）：`cols = ceil(sqrt(n))`、
 * `rows = ceil(n / cols)`，不足最后一行留空。
 */
export const TERMINAL_PANE_LAYOUT_KEY = 'adl:terminal.paneLayout';

export type PaneLayoutMode = 'equal' | 'free';

export interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TerminalPaneLayout {
  mode: PaneLayoutMode;
  colFractions: number[];
  rowFractions: number[];
  rects: Record<string, PaneRect>;
}

export const MIN_PANE_W = 200;
export const MIN_PANE_H = 120;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnitNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** 网格行列数：行主序 `cols×rows`，不足最后一行留空。 */
export function computeGrid(n: number): { cols: number; rows: number } {
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  const cols = Math.max(1, Math.ceil(Math.sqrt(safe)));
  const rows = Math.ceil(safe / cols);
  return { cols, rows };
}

/** 等分比例；count<=0 返回空数组。 */
export function equalFractions(count: number): number[] {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if (safe === 0) {
    return [];
  }
  return Array.from({ length: safe }, () => 1 / safe);
}

export function fractionToPx(fraction: number, total: number): number {
  if (!Number.isFinite(fraction) || !Number.isFinite(total)) {
    return 0;
  }
  return fraction * total;
}

export function defaultPaneLayout(n: number): TerminalPaneLayout {
  const { cols, rows } = computeGrid(n);
  return {
    mode: 'equal',
    colFractions: equalFractions(cols),
    rowFractions: equalFractions(rows),
    rects: {},
  };
}

function readPaneRect(raw: unknown): PaneRect | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const { x, y, w, h } = raw;
  if (isUnitNumber(x) && isUnitNumber(y) && isUnitNumber(w) && isUnitNumber(h)) {
    return { x, y, w, h };
  }
  return undefined;
}

function readRects(raw: unknown): Record<string, PaneRect> {
  if (!isPlainRecord(raw)) {
    return {};
  }
  const rects: Record<string, PaneRect> = {};
  for (const [paneId, value] of Object.entries(raw)) {
    const rect = readPaneRect(value);
    if (rect) {
      rects[paneId] = rect;
    }
  }
  return rects;
}

/** equal 比例：长度须等于轨道数且全为正有限数。 */
function isPositiveFractionArray(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry > 0)
  );
}

/**
 * 归一化单个标签布局：mode 白名单；比例长度/取值不合法时按网格重建；rects 逐项校验、非法丢弃。
 * `n` 为该标签当前窗格数。
 */
export function normalizePaneLayout(raw: unknown, n: number): TerminalPaneLayout {
  if (!isPlainRecord(raw)) {
    return defaultPaneLayout(n);
  }
  const { cols, rows } = computeGrid(n);
  const mode: PaneLayoutMode = raw.mode === 'free' ? 'free' : 'equal';
  const colFractions = isPositiveFractionArray(raw.colFractions, cols)
    ? [...raw.colFractions]
    : equalFractions(cols);
  const rowFractions = isPositiveFractionArray(raw.rowFractions, rows)
    ? [...raw.rowFractions]
    : equalFractions(rows);
  return { mode, colFractions, rowFractions, rects: readRects(raw.rects) };
}

function readNonNegativeFractionArray(value: unknown): number[] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0)
  ) {
    return undefined;
  }
  return [...value];
}

/**
 * 归一化整张标签布局映射（水合读侧）。
 *
 * 外层非普通对象 → `undefined`（交给 registry 回退 fallback）。
 * 此处**不修** ratio 长度：map 级不知道各标签的窗格数，长度修复延后到
 * `useTerminalPaneLayout` 按实际 pane 数调用 `normalizePaneLayout`；
 * 这里仅要求 fractions 为非负有限数数组，并校验 mode / rects 形状，
 * 形状不合法（含 fractions 非法）的标签项整项丢弃。
 */
export function normalizePaneLayoutMap(
  raw: unknown,
): Record<string, TerminalPaneLayout> | undefined {
  if (!isPlainRecord(raw)) {
    return undefined;
  }
  const map: Record<string, TerminalPaneLayout> = {};
  for (const [tabId, value] of Object.entries(raw)) {
    if (!isPlainRecord(value)) {
      continue;
    }
    const colFractions = readNonNegativeFractionArray(value.colFractions);
    const rowFractions = readNonNegativeFractionArray(value.rowFractions);
    if (!colFractions || !rowFractions) {
      continue;
    }
    map[tabId] = {
      mode: value.mode === 'free' ? 'free' : 'equal',
      colFractions,
      rowFractions,
      rects: readRects(value.rects),
    };
  }
  return map;
}

/** 第 index 个窗格在自动网格中的归一化矩形（行主序）。 */
export function autoRectForIndex(index: number, n: number): PaneRect {
  const { cols, rows } = computeGrid(n);
  const safeIndex = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
  return {
    x: (safeIndex % cols) / cols,
    y: Math.floor(safeIndex / cols) / rows,
    w: 1 / cols,
    h: 1 / rows,
  };
}

/**
 * 调整相邻两条轨道的比例（总和守恒），各侧不小于 `minPx/totalPx`。
 * 越界时按最小像素边界夹取；返回新数组。
 */
export function resizeFractions(
  fractions: number[],
  index: number,
  delta: number,
  minPx: number,
  totalPx: number,
): number[] {
  const next = [...fractions];
  if (index < 0 || index + 1 >= next.length) {
    return next;
  }
  const first = next[index];
  const second = next[index + 1];
  const sum = first + second;
  const minFraction = totalPx > 0 ? minPx / totalPx : 0;
  let nextFirst = first + delta;
  let nextSecond = second - delta;
  if (nextFirst < minFraction) {
    nextFirst = minFraction;
    nextSecond = sum - nextFirst;
  } else if (nextSecond < minFraction) {
    nextSecond = minFraction;
    nextFirst = sum - nextSecond;
  }
  next[index] = nextFirst;
  next[index + 1] = nextSecond;
  return next;
}

// 模块级缓存：构造期水合（persisted/registry 的 apply 汇聚器）填值，之后 loadAll 直接返回缓存。
// cacheSet 防御：构造期 apply 未运行（测试路径 / 提前调用）时，按需读一次存储避免返回错误空值。
let cache: Record<string, TerminalPaneLayout> = {};
let cacheSet = false;

function readAll(): Record<string, TerminalPaneLayout> {
  if (!cacheSet) {
    cache = readJson<Record<string, TerminalPaneLayout>>(TERMINAL_PANE_LAYOUT_KEY, {});
    cacheSet = true;
  }
  return cache;
}

export const terminalPaneLayoutStore = {
  loadForTab(tabId: string | undefined): TerminalPaneLayout | undefined {
    if (!tabId) {
      return undefined;
    }
    return readAll()[tabId];
  },
  saveForTab(tabId: string, layout: TerminalPaneLayout): void {
    const next = { ...readAll(), [tabId]: layout };
    cache = next;
    cacheSet = true;
    persist(TERMINAL_PANE_LAYOUT_KEY, next);
  },
  loadAll(): Record<string, TerminalPaneLayout> {
    return readAll();
  },
  saveAll(map: Record<string, TerminalPaneLayout>): void {
    cache = map;
    cacheSet = true;
    persist(TERMINAL_PANE_LAYOUT_KEY, map);
  },
  /** 构造期水合：把校验后的值交回模块缓存 */
  apply(value: Record<string, TerminalPaneLayout>): void {
    cache = value;
    cacheSet = true;
  },
};
