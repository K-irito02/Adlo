import { clamp } from '@stores/storageHelpers';
import { persist } from '@stores/persisted/persist';

/**
 * 终端面板的**视图偏好**（持久化）：布局模式、只读历史区的位置、历史区占主轴的比例。
 *
 * 为什么单独一个模块：这三项都是纯 UI 偏好，与 PTY 生命周期、标签状态无关；
 * 放在这里也能沿用 `terminalCwdStore` 同款的去抖持久化写法。
 */
export const TERMINAL_VIEW_PREFS_KEY = 'adl:terminal.viewPrefs';

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

// 模块级缓存：构造期水合（persisted/registry 的 apply 汇聚器）填值，之后 load 直接返回缓存。
// 有合法默认值，回退安全（见 brief：viewPrefs 不应读存储也安全）。
let cache: TerminalViewPrefs = DEFAULT_TERMINAL_VIEW_PREFS;

export const terminalViewPrefsStore = {
  load(): TerminalViewPrefs {
    return cache;
  },
  save(prefs: TerminalViewPrefs): void {
    cache = prefs;
    persist(TERMINAL_VIEW_PREFS_KEY, prefs);
  },
  /** 构造期水合：把校验+剪枝后的值交回模块缓存 */
  apply(value: TerminalViewPrefs): void {
    cache = value;
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
  // 像素下限换算成比例后与固定上下限取交。注意：mainSize < HISTORY_MIN_PX + LIVE_MIN_PX（184px）时
  // 两个像素下限互相矛盾、不可能同时满足（minRatio > maxRatio），此时末行「先 min 后 max」
  // 即取二者的包络区间兜底 —— 比例仍合法，只是极小面板下不再保证「历史 ≥64px 且 实时 ≥120px」同时成立。
  const minRatio = clamp(HISTORY_MIN_PX / mainSize, HISTORY_RATIO_MIN, HISTORY_RATIO_MAX);
  const maxRatio = clamp((mainSize - LIVE_MIN_PX) / mainSize, HISTORY_RATIO_MIN, HISTORY_RATIO_MAX);
  return clamp(size / mainSize, Math.min(minRatio, maxRatio), Math.max(minRatio, maxRatio));
}
