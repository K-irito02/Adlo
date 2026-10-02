/**
 * 透明桥接条（divider strip）纯逻辑：显隐判定、几何推算、拖拽增量换算。
 *
 * 背景：DOM 的边界拖拽手柄命中带只有 3px 且位于面板内部
 * （`.adl-rightpanel__resize-handle::before`），面板浏览器 WebView 的左缘与面板左缘
 * 重合时（导航器收起，Panel 侧内容整体左移）会把命中带整条盖住；两侧 WebView 贴合时
 * 更会被两个 OS 级子窗口同时吃掉命中事件。桥接条是 straddle 在边界上的透明子
 * WebView（`adl-divider-strip`），天然拥有命中权并把拖拽增量回传主窗口；本模块只做
 * 可单元测试的纯计算，副作用（show/hide/setBounds/事件订阅）归 `useDividerStrip`。
 */

export const DIVIDER_STRIP_WIDTH = 6;

export interface PanelRectLike {
  left: number;
  top: number;
  height: number;
}

export interface StripBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 由面板 border-box 矩形推算桥接条 bounds（client 坐标，取整对齐 Physical 惯例）。
 *
 * 与 dsh/浏览器 tab WebView 同尺子（client px = physical px，scaleFactor≠1
 * 时三者同向偏差、对齐仍成立）。若任一兄弟 bounds 改为 scaleFactor 换算，
 * 本函数须同步，否则条带错位。
 */
export function stripBoundsFromPanelRect(rect: PanelRectLike): StripBounds | null {
  if (![rect.left, rect.top, rect.height].every(Number.isFinite) || rect.height <= 0) {
    return null;
  }
  return {
    x: Math.round(rect.left - DIVIDER_STRIP_WIDTH / 2),
    y: Math.round(rect.top),
    width: DIVIDER_STRIP_WIDTH,
    height: Math.round(rect.height),
  };
}

export interface StripVisibilityInput {
  isTauri: boolean;
  /**
   * 面板侧浏览器 WebView 的左缘是否正压在面板边界上（等价于「面板导航器已收起」：
   * `.adl-tool-surface--files.is-navigator-collapsed > .adl-tool-navigator` 宽度归 0）。
   *
   * 这是桥接条**唯一**的显隐依据：DOM 拖拽手柄的命中带只有 3px 且位于面板内部
   * （`.adl-rightpanel__resize-handle::before { left: 8px }`，容器 `left: -8px`），
   * 面板自己的 WebView 一旦贴边就把它整条盖住 → 必须由桥接条把命中权抢回来。
   * 中心侧是否有 WebView **不影响**该判定：中心区有无原生表面，都不改变"面板
   * WebView 盖住命中带"这一事实。
   */
  panelWebViewAtBoundary: boolean;
  startupHidden: boolean;
  browserToolVisible: boolean;
  /** 面板是否有浏览器标签（宽松条件：条带多存在无害，误判缺失才会导致拖不动）。 */
  hasBrowserTabs: boolean;
}

/**
 * 仅当面板侧 WebView 压住边界命中带时展示桥接条。
 *
 * 注意**不含** `rightPanelMode`：面板处于 overlay 态时它仍以 `absolute` 贴左缘
 * 浮在中心区之上，命中带同样被自己的 WebView 盖住（此时中心 WebView 已被隐藏，
 * 更没有别的东西能兜住），因此 overlay 态恰恰**更需要**桥接条 —— 早期版本用
 * "centerObscured ⇒ 不展示"把它关掉，导致"拖到中间区 WebView 隐藏后边界再也拖不动"。
 */
export function shouldShowStrip(input: StripVisibilityInput): boolean {
  return (
    input.isTauri &&
    input.panelWebViewAtBoundary &&
    input.startupHidden &&
    input.browserToolVisible &&
    input.hasBrowserTabs
  );
}

/** `resolveCenterWebView` 的结构入参（只取判定所需字段，便于纯函数单测）。 */
export interface CenterWebViewInput {
  centerTabs: readonly { id: string; kind: string; refId: string | null }[];
  centerActiveTabId: string;
  browserTabsById: Record<string, { url?: string } | undefined>;
  isTabInPool: (tabId: string) => boolean;
}

export interface CenterWebViewState {
  /** 中心区是否有可见的原生 WebView（true 时才可能与被板 WebView 贴边）。 */
  active: boolean;
  /** 中心活动浏览器标签 id（非 active 时为空串，避免把陈旧 id 喂给排序指纹）。 */
  tabId: string;
  /** 中心活动浏览器标签 URL（非 active 时为空串）。 */
  url: string;
}

/**
 * 推算中心区当前承载的浏览器 WebView 是否真实可见。
 *
 * 用途：**仅**作为兄弟排序指纹（见 `stripGenerationKey`）的输入 —— 中心活动标签
 * 变化意味着可能有新的原生子窗口压到桥接条之上，必须销毁重建以回到最上层。
 * 它**不**参与显隐判定（显隐只看面板侧，见 `shouldShowStrip`）。
 *
 * 终端中心标签是 DOM 渲染（无原生子窗口），空 URL / `about:blank` 标签的 WebView
 * 已被 `useWebViewLifecycle` 移出画面，故都不算 active。
 *
 * 历史：显隐判定曾直接读 dsh 专属状态（`dshSlice.isOpen` / `url`）——那时中心区
 * 只可能由 dsh 占据。dsh 改为普通浏览器标签后该状态不再代表"中心区有 WebView"，
 * 属于陈旧判定，已随显隐判定一并改为面板侧口径。
 */
export function resolveCenterWebView(input: CenterWebViewInput): CenterWebViewState {
  const centerTab = input.centerTabs.find((tab) => tab.id === input.centerActiveTabId);
  const tabId = centerTab?.kind === 'browser' ? (centerTab.refId ?? '') : '';
  const url = tabId ? (input.browserTabsById[tabId]?.url ?? '') : '';
  const active = !!tabId && !!url && url !== 'about:blank' && input.isTabInPool(tabId);
  return active ? { active, tabId, url } : { active: false, tabId: '', url: '' };
}

export interface StripGenerationParts {
  /** 中心活动浏览器标签：换标签/换网址都可能新建子窗口并盖住桥接条。 */
  centerTabId: string;
  centerUrl: string;
  activeTabId: string;
  tabCount: number;
  /** 兄弟子窗口创建计数：中心/面板浏览器 tab 视图的任何（重）建都递增。 */
  siblingNonce: number;
}

/**
 * 兄弟 WebView 排序指纹：任一变化都可能新建子窗口并盖住桥接条，
 * 此时必须销毁重建桥接条（重建即回到最上层）。
 * JSON 序列化避免分隔符拼接的理论碰撞（如 URL 含 `|`）。
 */
export function stripGenerationKey(parts: StripGenerationParts): string {
  return JSON.stringify([
    parts.centerTabId,
    parts.centerUrl,
    parts.activeTabId,
    parts.tabCount,
    parts.siblingNonce,
  ]);
}

/** 桥接条拖拽增量换算：与 DOM 手柄同约定（左移加宽）。 */
export function applyStripDelta(
  startWidth: number,
  totalDx: number,
  clamp: (width: number) => number,
): number {
  return clamp(startWidth - totalDx);
}
