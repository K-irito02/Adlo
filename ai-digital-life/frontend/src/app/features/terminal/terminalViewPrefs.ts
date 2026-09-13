import { clamp, makePersistedWriter, readJson } from '@stores/storageHelpers';

/**
 * 终端面板的**视图偏好**（持久化）：布局模式、只读历史区的位置、历史区占主轴的比例。
 *
 * 为什么单独一个模块：这三项都是纯 UI 偏好，与 PTY 生命周期、标签状态无关；
 * 放在这里也能沿用 `terminalCwdStore` 同款的去抖持久化写法。
 */
export const TERMINAL_VIEW_PREFS_KEY = 'adl-terminal:view-prefs';

export type TerminalViewMode = 'single' | 'dual';

export interface TerminalViewPrefs {
  /** single = 单列视图（上下布局）；dual = 双列视图（左右布局） */
  mode: TerminalViewMode;
  /** 只读历史区是否排在主轴首位（单列 = 在上，双列 = 在左） */
  historyFirst: boolean;
  /** 只读历史区占主轴长度的比例 */
  historyRatio: number;
}

/** 比例的下限/上限：保证两侧都还看得见 */
export const HISTORY_RATIO_MIN = 0.12;
export const HISTORY_RATIO_MAX = 0.8;
/** 像素级下限：面板很短时也不让任一侧被压没 */
export const HISTORY_MIN_PX = 64;
export const LIVE_MIN_PX = 120;

export const DEFAULT_TERMINAL_VIEW_PREFS: TerminalViewPrefs = {
  mode: 'single',
  historyFirst: true,
  historyRatio: 0.32,
};

const scheduleWrite = makePersistedWriter(TERMINAL_VIEW_PREFS_KEY);

/** 容错归一化：持久化数据可能缺失、类型不对或越界 */
export function normalizeTerminalViewPrefs(raw: unknown): TerminalViewPrefs {
  const value = (raw ?? {}) as Partial<TerminalViewPrefs>;
  return {
    mode: value.mode === 'dual' ? 'dual' : 'single',
    historyFirst: value.historyFirst !== false,
    historyRatio:
      typeof value.historyRatio === 'number' && Number.isFinite(value.historyRatio)
        ? clamp(value.historyRatio, HISTORY_RATIO_MIN, HISTORY_RATIO_MAX)
        : DEFAULT_TERMINAL_VIEW_PREFS.historyRatio,
  };
}

export const terminalViewPrefsStore = {
  load(): TerminalViewPrefs {
    return normalizeTerminalViewPrefs(readJson<unknown>(TERMINAL_VIEW_PREFS_KEY, null));
  },
  save(prefs: TerminalViewPrefs): void {
    scheduleWrite(prefs);
  },
};

interface RatioFromPointerArgs {
  /** 指针相对容器主轴起点边缘的偏移（单列 = clientY - top，双列 = clientX - left） */
  pointerMain: number;
  /** 容器主轴长度（单列 = 高度，双列 = 宽度） */
  mainSize: number;
  /** 只读历史区是否在主轴首位 */
  historyFirst: boolean;
}

/**
 * 把拖拽分界线时的指针位置换算成「历史区占比」。
 *
 * 历史区在首位时占比就是指针到起点边缘的距离占比；在末位时取补集，
 * 这样无论两区怎么换位，拖拽手感都是「拖着分界线走」。
 */
export function ratioFromPointer({
  pointerMain,
  mainSize,
  historyFirst,
}: RatioFromPointerArgs): number {
  if (mainSize <= 0) {
    return DEFAULT_TERMINAL_VIEW_PREFS.historyRatio;
  }
  const size = historyFirst ? pointerMain : mainSize - pointerMain;
  // 像素下限换算成比例后与固定上下限取交（面板极短时两者可能互相矛盾，取包络区间兜底）
  const minRatio = clamp(HISTORY_MIN_PX / mainSize, HISTORY_RATIO_MIN, HISTORY_RATIO_MAX);
  const maxRatio = clamp((mainSize - LIVE_MIN_PX) / mainSize, HISTORY_RATIO_MIN, HISTORY_RATIO_MAX);
  return clamp(size / mainSize, Math.min(minRatio, maxRatio), Math.max(minRatio, maxRatio));
}
