import type { HeatmapBin, HeatmapColumn } from './heatmap-context';
import type { Margin } from '../chart-context';

export const HEATMAP_MONTHS_ONE_YEAR = 12;

export const HEATMAP_MONTHS_SIX = 6;

export const HEATMAP_WEEKS_ONE_YEAR = 52;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = MS_PER_DAY * 7;

export function getHeatmapCalendarRangeStart(today: Date, months: number): Date {
  const monthOffset = months === HEATMAP_MONTHS_SIX ? months : months - 1;
  const start = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getHeatmapYearStartMonth(today: Date): Date {
  return getHeatmapCalendarRangeStart(today, HEATMAP_MONTHS_ONE_YEAR);
}

export function getHeatmapWeekStartSunday(date: Date): Date {
  const sunday = new Date(date);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

export function getHeatmapWeekCount(startSunday: Date, endDate: Date): number {
  const endSunday = getHeatmapWeekStartSunday(endDate);
  return Math.floor((endSunday.getTime() - startSunday.getTime()) / MS_PER_WEEK) + 1;
}

export function countHeatmapWeekDaysOnOrAfter(weekStart: Date, threshold: Date): number {
  const day = new Date(weekStart);
  day.setHours(0, 0, 0, 0);
  const cutoff = new Date(threshold);
  cutoff.setHours(0, 0, 0, 0);
  let count = 0;

  for (let i = 0; i < 7; i++) {
    if (day >= cutoff) {
      count++;
    }
    day.setDate(day.getDate() + 1);
  }

  return count;
}

export function getHeatmapWeekStartAlignedToRange(rangeStart: Date, minDaysInFirstWeek = 4): Date {
  const startDate = getHeatmapWeekStartSunday(rangeStart);
  const weekEnd = new Date(startDate);
  weekEnd.setDate(weekEnd.getDate() + 6);

  if (rangeStart >= startDate && rangeStart <= weekEnd) {
    return startDate;
  }

  while (countHeatmapWeekDaysOnOrAfter(startDate, rangeStart) < minDaysInFirstWeek) {
    startDate.setDate(startDate.getDate() + 7);
  }

  return startDate;
}

export function getHeatmapMonthLabelColumnIndex(
  columnIndex: number,
  separatorLayout: Pick<HeatmapSeparatorLayout, 'atColumns'> | null,
): number {
  if (!separatorLayout?.atColumns.length) {
    return columnIndex;
  }

  return getHeatmapSeparatorGroupStartColumn(columnIndex, separatorLayout.atColumns);
}

export interface HeatmapWeekRange {
  startDate: Date;
  weekCount: number;
  rangeStart: Date | null;
}

export function resolveHeatmapWeekRange(
  today: Date,
  weeks: number = HEATMAP_WEEKS_ONE_YEAR,
): HeatmapWeekRange {
  const endDate = new Date(today);
  endDate.setHours(0, 0, 0, 0);

  if (weeks === HEATMAP_WEEKS_ONE_YEAR) {
    const rangeStart = getHeatmapYearStartMonth(endDate);
    const startDate = getHeatmapWeekStartAlignedToRange(rangeStart);
    return {
      startDate,
      weekCount: getHeatmapWeekCount(startDate, endDate),
      rangeStart,
    };
  }

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (weeks - 1) * 7);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  startDate.setHours(0, 0, 0, 0);

  return {
    startDate,
    weekCount: weeks,
    rangeStart: null,
  };
}

export function getHeatmapColumnMonthAnchor(column: HeatmapColumn): Date | null {
  for (const bin of column.bins) {
    if (bin.date && bin.date.getDate() === 1) {
      return bin.date;
    }
  }

  const firstDate = column.bins[0]?.date;
  if (!firstDate) {
    return null;
  }

  return new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
}

export function getHeatmapColumnStartDate(column: HeatmapColumn): Date | null {
  return column.bins[0]?.date ?? null;
}

export function getHeatmapColumnEndDate(column: HeatmapColumn): Date | null {
  const lastBin = column.bins.at(-1);
  return lastBin?.date ?? null;
}

export function getHeatmapTimeExtent(columns: HeatmapColumn[]): [Date, Date] | null {
  if (columns.length === 0) {
    return null;
  }

  const firstColumn = columns[0];
  if (!firstColumn) {
    return null;
  }
  const start = getHeatmapColumnStartDate(firstColumn);
  const lastColumn = columns.at(-1);
  if (!lastColumn) {
    return null;
  }
  const end = getHeatmapColumnEndDate(lastColumn);
  if (!(start && end)) {
    return null;
  }

  return [start, end];
}

export function filterHeatmapColumns(
  columns: HeatmapColumn[],
  xDomain?: [Date, Date],
): HeatmapColumn[] {
  if (!xDomain) {
    return columns;
  }

  if (columns.length > 0 && columns[0].bins[0]?.date == null) {
    return columns;
  }

  const start = Math.min(xDomain[0].getTime(), xDomain[1].getTime());
  const end = Math.max(xDomain[0].getTime(), xDomain[1].getTime());

  return columns.filter((column) => {
    const weekStart = getHeatmapColumnStartDate(column)?.getTime();
    const weekEnd = getHeatmapColumnEndDate(column)?.getTime();
    if (weekStart == null || weekEnd == null) {
      return false;
    }
    return weekEnd >= start && weekStart <= end;
  });
}

export const HEATMAP_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type HeatmapWeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function getHeatmapDayLabels(weekStartDay: HeatmapWeekStartDay = 0): readonly string[] {
  if (weekStartDay === 0) {
    return HEATMAP_DAY_LABELS;
  }

  return [...HEATMAP_DAY_LABELS.slice(weekStartDay), ...HEATMAP_DAY_LABELS.slice(0, weekStartDay)];
}

export function rotateHeatmapColumnBins(
  columns: HeatmapColumn[],
  weekStartDay?: HeatmapWeekStartDay,
): HeatmapColumn[] {
  if (weekStartDay == null || weekStartDay === 0) {
    return columns;
  }

  return columns.map((column) => ({
    ...column,
    bins: [...column.bins.slice(weekStartDay), ...column.bins.slice(0, weekStartDay)],
  }));
}

export type HeatmapSeparatorGroupBy = 'every' | 'quarter';

export interface HeatmapSeparatorParsedConfig {
  groupBy: HeatmapSeparatorGroupBy;
  every?: number;
  spacing: number;
}

export interface HeatmapSeparatorGroup {
  startColumnIndex: number;
  quarter: number;
  year: number;
  startDate: Date;
  label: string;
}

export interface HeatmapSeparatorLayout {
  spacing: number;
  atColumns: number[];
  groups: HeatmapSeparatorGroup[];
}

export type HeatmapSeparatorStrokeStyle = 'solid' | 'dashed';

export interface HeatmapSeparatorGradient {
  from: string;
  via?: string;
  to: string;
  fromOpacity?: number;
  viaOpacity?: number;
  toOpacity?: number;
}

export interface HeatmapSeparatorGradientStop {
  offset: string;
  color: string;
  opacity: number;
}

export function buildHeatmapSeparatorGradientStops(
  gradient: HeatmapSeparatorGradient,
  strokeOpacity = 1,
): HeatmapSeparatorGradientStop[] {
  const scaleOpacity = (value: number | undefined, fallback = 1) =>
    (value ?? fallback) * strokeOpacity;

  if (gradient.via != null) {
    return [
      {
        offset: '0%',
        color: gradient.from,
        opacity: scaleOpacity(gradient.fromOpacity),
      },
      {
        offset: '50%',
        color: gradient.via,
        opacity: scaleOpacity(gradient.viaOpacity),
      },
      {
        offset: '100%',
        color: gradient.to,
        opacity: scaleOpacity(gradient.toOpacity),
      },
    ];
  }

  return [
    {
      offset: '0%',
      color: gradient.from,
      opacity: scaleOpacity(gradient.fromOpacity),
    },
    {
      offset: '100%',
      color: gradient.to,
      opacity: scaleOpacity(gradient.toOpacity),
    },
  ];
}

export function resolveHeatmapSeparatorStrokeDasharray(
  strokeStyle: HeatmapSeparatorStrokeStyle = 'solid',
  strokeDasharray?: string,
): string | undefined {
  if (strokeStyle !== 'dashed') {
    return undefined;
  }
  return strokeDasharray ?? '4,4';
}

export function getCalendarQuarter(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

const CALENDAR_QUARTER_START_MONTHS = [0, 3, 6, 9] as const;

export function getCalendarQuarterStartDatesBetween(gridStart: Date, gridEnd: Date): Date[] {
  const startTime = gridStart.getTime();
  const endTime = gridEnd.getTime();
  const dates: Date[] = [];

  for (let year = gridStart.getFullYear(); year <= gridEnd.getFullYear(); year++) {
    for (const month of CALENDAR_QUARTER_START_MONTHS) {
      const date = new Date(year, month, 1);
      date.setHours(0, 0, 0, 0);
      const time = date.getTime();
      if (time > startTime && time <= endTime) {
        dates.push(date);
      }
    }
  }

  return dates;
}

export function findHeatmapColumnIndexForDate(columns: HeatmapColumn[], date: Date): number | null {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const targetTime = target.getTime();

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const column = columns[columnIndex];
    if (!column) {
      continue;
    }

    const weekStart = getHeatmapColumnStartDate(column);
    const weekEnd = getHeatmapColumnEndDate(column);
    if (!(weekStart && weekEnd)) {
      continue;
    }

    weekStart.setHours(0, 0, 0, 0);
    weekEnd.setHours(0, 0, 0, 0);
    if (targetTime >= weekStart.getTime() && targetTime <= weekEnd.getTime()) {
      return columnIndex;
    }
  }

  return null;
}

export function getHeatmapColumnQuarterAnchor(column: HeatmapColumn): {
  quarter: number;
  year: number;
  date: Date;
} | null {
  for (const bin of column.bins) {
    if (!bin.date) {
      continue;
    }
    const month = bin.date.getMonth();
    if (bin.date.getDate() === 1 && month % 3 === 0) {
      return {
        quarter: month / 3 + 1,
        year: bin.date.getFullYear(),
        date: bin.date,
      };
    }
  }

  const firstDate = column.bins[0]?.date;
  if (!firstDate) {
    return null;
  }

  const quarter = getCalendarQuarter(firstDate);
  return {
    quarter,
    year: firstDate.getFullYear(),
    date: new Date(firstDate.getFullYear(), (quarter - 1) * 3, 1),
  };
}

export function getHeatmapSeparatorGroupStartColumn(
  columnIndex: number,
  atColumns: number[],
): number {
  let groupStart = 0;

  for (const start of atColumns) {
    if (start <= columnIndex) {
      groupStart = start;
    } else {
      break;
    }
  }

  return groupStart;
}

export function getHeatmapSeparatorColumnIndices(columnCount: number, every: number): number[] {
  if (every <= 0 || columnCount <= every) {
    return [];
  }

  const indices: number[] = [];
  for (let columnIndex = every; columnIndex < columnCount; columnIndex += every) {
    indices.push(columnIndex);
  }
  return indices;
}

export function inferHeatmapCalendarRangeStart(columns: HeatmapColumn[]): Date | null {
  const firstColumn = columns[0];
  if (!firstColumn) {
    return null;
  }

  const gridStart = getHeatmapColumnStartDate(firstColumn);
  if (!gridStart) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const months of [HEATMAP_MONTHS_SIX, HEATMAP_MONTHS_ONE_YEAR]) {
    const rangeStart = getHeatmapCalendarRangeStart(today, months);
    const alignedStart = getHeatmapWeekStartAlignedToRange(rangeStart);
    if (gridStart.getTime() === alignedStart.getTime()) {
      return rangeStart;
    }
  }

  return null;
}

export function buildHeatmapQuarterSeparatorGroups(
  columns: HeatmapColumn[],
): HeatmapSeparatorGroup[] {
  if (columns.length === 0) {
    return [];
  }

  const extent = getHeatmapTimeExtent(columns);
  if (!extent) {
    return [];
  }

  const [extentStart, gridEnd] = extent;
  const displayRange = resolveHeatmapDisplayRange(columns);
  const quarterRangeStart =
    displayRange.start ?? inferHeatmapCalendarRangeStart(columns) ?? extentStart;
  const firstQuarter = getCalendarQuarter(quarterRangeStart);

  const groups: HeatmapSeparatorGroup[] = [
    {
      startColumnIndex: 0,
      quarter: firstQuarter,
      year: quarterRangeStart.getFullYear(),
      startDate: quarterRangeStart,
      label: `Q${firstQuarter}`,
    },
  ];

  const usedColumns = new Set<number>([0]);
  const quarterStarts = getCalendarQuarterStartDatesBetween(quarterRangeStart, gridEnd);

  for (const quarterStart of quarterStarts) {
    const columnIndex = findHeatmapColumnIndexForDate(columns, quarterStart);
    if (columnIndex == null || columnIndex === 0 || usedColumns.has(columnIndex)) {
      continue;
    }

    usedColumns.add(columnIndex);
    const quarter = getCalendarQuarter(quarterStart);
    groups.push({
      startColumnIndex: columnIndex,
      quarter,
      year: quarterStart.getFullYear(),
      startDate: quarterStart,
      label: `Q${quarter}`,
    });
  }

  groups.sort((a, b) => a.startColumnIndex - b.startColumnIndex);
  return groups;
}

export function resolveHeatmapSeparatorLayout(
  config: HeatmapSeparatorParsedConfig | null,
  columns: HeatmapColumn[],
): HeatmapSeparatorLayout | null {
  if (!config) {
    return null;
  }

  if (config.groupBy === 'quarter') {
    const groups = buildHeatmapQuarterSeparatorGroups(columns);
    if (groups.length === 0) {
      return null;
    }

    return {
      spacing: config.spacing,
      atColumns: groups
        .map((group) => group.startColumnIndex)
        .filter((columnIndex) => columnIndex > 0),
      groups,
    };
  }

  if (!config.every || config.every <= 0) {
    return null;
  }

  const atColumns = getHeatmapSeparatorColumnIndices(columns.length, config.every);

  return {
    spacing: config.spacing,
    atColumns,
    groups: [],
  };
}

export function getHeatmapSeparatorCount(
  separator: Pick<HeatmapSeparatorLayout, 'atColumns'> | null,
): number {
  return separator?.atColumns.length ?? 0;
}

export function getHeatmapColumnXOffset(
  columnIndex: number,
  separator: Pick<HeatmapSeparatorLayout, 'spacing' | 'atColumns'> | null,
): number {
  if (!separator || separator.spacing <= 0) {
    return 0;
  }
  if (columnIndex <= 0) {
    return 0;
  }

  const separatorCount = separator.atColumns.filter((atColumn) => atColumn <= columnIndex).length;
  return separatorCount * separator.spacing;
}

export function getHeatmapPlotInnerWidth(
  columnCount: number,
  binWidth: number,
  separator: Pick<HeatmapSeparatorLayout, 'spacing' | 'atColumns'> | null,
): number {
  const separatorCount = separator ? getHeatmapSeparatorCount(separator) : 0;
  return columnCount * binWidth + separatorCount * (separator?.spacing ?? 0);
}

export function getHeatmapSeparatorLineY({
  innerHeight,
  marginTop,
  startOffset,
  paddingY = 0,
}: {
  innerHeight: number;
  marginTop: number;
  startOffset?: number;
  paddingY?: number;
}): { y1: number; y2: number } {
  const resolvedStart = startOffset ?? marginTop;
  const y1 = resolvedStart - marginTop + paddingY;
  const y2 = Math.max(innerHeight - paddingY, y1);
  return { y1, y2 };
}

export function getHeatmapSeparatorX(
  columnIndex: number,
  gap: number,
  separator: Pick<HeatmapSeparatorLayout, 'spacing'>,
  xScale: (columnIndex: number) => number,
): number {
  if (separator.spacing > 0) {
    return xScale(columnIndex) - separator.spacing / 2;
  }
  return xScale(columnIndex) - gap / 2;
}

export interface HeatmapDisplayRange {
  start: Date | null;
  end: Date | null;
}

export function isHeatmapGhostBin(bin: HeatmapBin, range: HeatmapDisplayRange): boolean {
  if (bin.date == null) {
    return false;
  }
  const time = bin.date.getTime();
  if (range.end && time > range.end.getTime()) {
    return true;
  }
  if (range.start && time < range.start.getTime()) {
    return true;
  }
  return false;
}

export function resolveHeatmapDisplayRange(columns: HeatmapColumn[]): HeatmapDisplayRange {
  if (columns.length === 0) {
    return { start: null, end: null };
  }

  const extent = getHeatmapTimeExtent(columns);
  if (!extent) {
    return { start: null, end: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstColumn = columns[0];
  if (!firstColumn) {
    return { start: null, end: null };
  }

  const gridStart = getHeatmapColumnStartDate(firstColumn);
  if (!gridStart) {
    return { start: null, end: null };
  }

  const inferredStart = inferHeatmapCalendarRangeStart(columns);

  if (inferredStart && extent[1].getTime() >= today.getTime()) {
    return { start: inferredStart, end: today };
  }

  return { start: null, end: null };
}

export type HeatmapLayout = 'fluid' | 'fill';

export function computeHeatmapDimensions({
  width,
  parentHeight,
  margin,
  columnCount,
  rowCount,
  binSize,
  layout,
  separator,
  minBinSize = 0,
  maxBinSize = 0,
}: {
  width: number;
  parentHeight: number;
  margin: Margin;
  columnCount: number;
  rowCount: number;
  binSize: number;
  layout: HeatmapLayout;
  separator: Pick<HeatmapSeparatorLayout, 'spacing' | 'atColumns'> | null;
  minBinSize?: number;
  maxBinSize?: number;
}) {
  // Defensive normalization for a public helper: a caller may pass degenerate
  // dimensions or swapped bounds. Cells must never divide by zero, and an
  // inverted min/max pair would otherwise collapse to the smaller bound (the
  // `maxBinSize` value) forever.
  const cols = Math.max(columnCount, 1);
  const rows = Math.max(rowCount, 1);
  const lo = minBinSize > 0 ? minBinSize : 0;
  const hi = maxBinSize > 0 ? maxBinSize : 0;
  const minClamp = lo > 0 && hi > 0 ? Math.min(lo, hi) : lo;
  const maxClamp = lo > 0 && hi > 0 ? Math.max(lo, hi) : hi;

  const innerWidth = Math.max(width - margin.left - margin.right, 0);
  const availableHeight = Math.max(parentHeight - margin.top - margin.bottom, 0);
  const separatorCount = separator ? getHeatmapSeparatorCount(separator) : 0;
  const totalSpacing = separatorCount * (separator?.spacing ?? 0);

  const clampCell = (size: number): number => {
    let clamped = size;
    if (minClamp > 0) {
      clamped = Math.max(clamped, minClamp);
    }
    if (maxClamp > 0) {
      clamped = Math.min(clamped, maxClamp);
    }
    return clamped;
  };

  let binWidth: number;
  let binHeight: number;

  if (binSize > 0) {
    const clamped = clampCell(binSize);
    binWidth = clamped;
    binHeight = clamped;
  } else if (layout === 'fluid') {
    const cellSize = clampCell(Math.max((innerWidth - totalSpacing) / cols, 0));
    binWidth = cellSize;
    binHeight = cellSize;
  } else {
    const cellSize = clampCell(
      Math.min(Math.max((innerWidth - totalSpacing) / cols, 0), availableHeight / rows),
    );
    binWidth = cellSize;
    binHeight = cellSize;
  }

  const plotInnerWidth = getHeatmapPlotInnerWidth(cols, binWidth, separator);
  const innerHeight = rows * binHeight;
  const height =
    layout === 'fluid'
      ? margin.top + innerHeight + margin.bottom
      : Math.max(parentHeight, margin.top + innerHeight + margin.bottom);
  // A min clamp can push the plot wider than the container (e.g. the calendar
  // with 53 week columns in a narrow panel). The SVG must then expand past the
  // container width so horizontal scroll reveals the cells — otherwise the SVG
  // viewport clips them and the scrolled region renders blank.
  const naturalWidth = margin.left + plotInnerWidth + margin.right;
  const chartWidth =
    binSize > 0 && layout === 'fluid' ? naturalWidth : Math.max(width, naturalWidth);

  return {
    binWidth,
    binHeight,
    innerWidth: plotInnerWidth,
    innerHeight,
    height,
    width: chartWidth,
  };
}
