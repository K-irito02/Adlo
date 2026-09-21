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
