/**
 * 透明桥接条（divider strip）纯逻辑：显隐判定、几何推算、拖拽增量换算。
 *
 * 背景：dsh WebView2（中间区）与浏览器 tab WebView2（右侧面板，侧边栏收起时）
 * 以零间隙贴边相邻，两者均为 OS 级子窗口，吃掉分隔线命中带的鼠标事件。
 * 桥接条是 straddle 在边界上的透明子 WebView（`adl-divider-strip`），
 * 天然拥有命中权并把拖拽增量回传主窗口；本模块只做可单元测试的纯计算，
 * 副作用（show/hide/setBounds/事件订阅）归 `useDividerStrip`。
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

/** 由面板 border-box 矩形推算桥接条 bounds（client 坐标，取整对齐 Physical 惯例）。 */
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
  dshOpen: boolean;
  startupHidden: boolean;
  browserToolVisible: boolean;
  hasBrowserTabs: boolean;
  /** 中间区被遮挡（右面板 overlay / 启动覆盖层）时 dsh WebView 已移出画面，无需桥接。 */
  centerObscured: boolean;
}

/** 仅当两侧 WebView 同时在线且贴边相邻（docked）时才需要桥接条。 */
export function shouldShowStrip(input: StripVisibilityInput): boolean {
  return (
    input.isTauri &&
    input.dshOpen &&
    input.startupHidden &&
    input.browserToolVisible &&
    input.hasBrowserTabs &&
    !input.centerObscured
  );
}

export interface StripGenerationParts {
  dshUrl: string;
  activeTabId: string;
  tabCount: number;
  /** 兄弟子窗口创建计数：dsh/浏览器 tab 视图的任何（重）建都递增。 */
  siblingNonce: number;
}

/**
 * 兄弟 WebView 排序指纹：任一变化都可能新建子窗口并盖住桥接条，
 * 此时必须销毁重建桥接条（重建即回到最上层）。
 * JSON 序列化避免分隔符拼接的理论碰撞（如 dshUrl 含 `|`）。
 */
export function stripGenerationKey(parts: StripGenerationParts): string {
  return JSON.stringify([parts.dshUrl, parts.activeTabId, parts.tabCount, parts.siblingNonce]);
}

/** 桥接条拖拽增量换算：与 DOM 手柄同约定（左移加宽）。 */
export function applyStripDelta(
  startWidth: number,
  totalDx: number,
  clamp: (width: number) => number,
): number {
  return clamp(startWidth - totalDx);
}
