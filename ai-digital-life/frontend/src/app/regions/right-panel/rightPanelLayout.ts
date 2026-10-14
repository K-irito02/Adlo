export type RightPanelMode = 'docked' | 'overlay_partial' | 'overlay_full';

export const RIGHT_PANEL_MODES: readonly RightPanelMode[] = [
  'docked',
  'overlay_partial',
  'overlay_full',
];

// ─────────────────────────────────────────────────────────────
// 右侧面板模式与可恢复宽度的水合缓存（Task 29，登记表 apply 目标）。
//
// useRightPanelLayout 是 hook（非 slice）：构造期水合经 hydrateAll 把校验后的值
// 交回此处（乙类契约，见 persisted/entry.ts）；hook 初始值读缓存（首帧渲染在水合
// 之后），写入走 persist()（唯一写通道）。本模块无任何导入，登记表可安全引用。
// ─────────────────────────────────────────────────────────────
let cachedMode: RightPanelMode | undefined;
let cachedRestorableWidth: number | undefined;

/** 登记表 `adl:ui.rightPanelMode` 的 apply：水合（或回退 'docked'）交回缓存 */
export function applyRightPanelMode(value: RightPanelMode): void {
  cachedMode = value;
}

/** hook 初始模式：水合前恒为旧默认值 'docked'（与旧 readPersistedRightPanelMode 一致） */
export function readCachedRightPanelMode(): RightPanelMode {
  return cachedMode ?? 'docked';
}

/**
 * 登记表 `adl:ui.rightPanelLastRestorableWidth` 的 apply：仅接受有限数。
 * 登记表 fallback 为 NaN（见 registry 注释），此处忽略——缓存保持 empty，
 * hook 即回退到实时 rightPanelWidth（与旧"无存储即用当前宽度"一致）。
 */
export function applyRightPanelLastRestorableWidth(value: number): void {
  if (Number.isFinite(value)) {
    cachedRestorableWidth = value;
  }
}

/** hook 初始可恢复宽度：从未存储时为 undefined，调用方回退到实时宽度 */
export function readCachedRightPanelLastRestorableWidth(): number | undefined {
  return cachedRestorableWidth;
}

/** 测试专用：清除模块级缓存，模拟全新启动 */
export function resetRightPanelLayoutCacheForTest(): void {
  cachedMode = undefined;
  cachedRestorableWidth = undefined;
}

export interface RightPanelOverlayState {
  overlayActive: boolean;
  overlayExpanded: boolean;
}

export function deriveRightPanelOverlayState(
  mode: RightPanelMode,
  collapsed: boolean,
): RightPanelOverlayState {
  if (collapsed || mode === 'docked') {
    return {
      overlayActive: false,
      overlayExpanded: false,
    };
  }

  return {
    overlayActive: true,
    overlayExpanded: mode === 'overlay_full',
  };
}

/**
 * 被动几何同步是否应跳过。
 *
 * - 隐藏：页面 `hidden`（最小化/被遮挡）。
 * - shell 尺寸退化（`shellWidth` ≈ 0）。
 * - 视口最小化量级：Tauri 窗口有 640x480 最小尺寸约束（见 tauri.conf.json），
 *   用户永远无法把窗口调到更小；`innerWidth/innerHeight` 远小于此（如 Windows
 *   最小化过渡态的 144x19，而 shell 矩形会滞后给出 395 这种"看似正常"的值）
 *   说明窗口正处在最小化过渡态。此时按 `rightMaxWidth` 收窄会把面板宽度错误
 *   钳小并提交到 store（`setRightPanelWidth` 持久化），恢复后右面板变窄、
 *   中间区侵占（2026-09-30 最小化→恢复 regression）。
 *   浏览器模式下无最小尺寸约束、极小视口同样跳过：方向是安全的（只推迟同步、
 *   不污染持久化宽度；窗口放大后即补算），而非显示回归。
 */
// 最小化过渡态判定阈值：取 Tauri 最小窗口约束（640x480）的一半作余量，覆盖
// 边框/DPI 偏差；用户正常缩放永远到不了这么小，浏览器模式极小窗口同样推迟
// 同步（只推迟、不污染持久化，窗口放大后即补算——安全方向）。
export const MINIMIZED_VIEWPORT_WIDTH_GUARD = 320;
export const MINIMIZED_VIEWPORT_HEIGHT_GUARD = 240;

/**
 * 解析覆盖态锚列宽（纯函数，可单测）。
 *
 * 锚列是网格第三列在覆盖态的预留宽度（docked 边界），作用是进出覆盖时网格不跳变。
 * 它在进入覆盖时按当时阈值设定，之后保持稳定（窗口连续变化时不跟随，保证编辑器
 * 换行稳定）。但左栏收起/展开是离散的布局基变更，阈值随之跳变；若锚不跟进，
 * 后续覆盖→停靠翻转瞬间网格中心宽会跳变（旧锚 vs 新阈值之差，左栏 260px 即 260px
 * 跳变 → 中间区按钮整体瞬移，事项 8）。因此左栏切换时必须用 `rebaseAnchor` 把锚
 * 重定到实时阈值；连续变化（窗口/拖拽）不 rebase。
 */
export function resolveOverlayAnchorWidth(
  previousMode: RightPanelMode,
  nextMode: RightPanelMode,
  currentAnchorWidth: number | undefined,
  overlayThreshold: number,
  rebaseAnchor: boolean,
): number | undefined {
  if (nextMode === 'docked') {
    return undefined;
  }
  if (rebaseAnchor || previousMode === 'docked' || currentAnchorWidth === undefined) {
    return overlayThreshold;
  }
  return currentAnchorWidth;
}

export function shouldSkipPassiveLayoutSync(
  hidden: boolean,
  shellWidth: number,
  innerWidth: number,
  innerHeight: number,
): boolean {
  if (hidden) {
    return true;
  }
  if (!Number.isFinite(shellWidth) || shellWidth <= 0) {
    return true;
  }
  if (
    !Number.isFinite(innerWidth) ||
    !Number.isFinite(innerHeight) ||
    innerWidth < MINIMIZED_VIEWPORT_WIDTH_GUARD ||
    innerHeight < MINIMIZED_VIEWPORT_HEIGHT_GUARD
  ) {
    return true;
  }
  return false;
}
