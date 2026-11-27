export interface CenterOverlayFlags {
  browserMenuOpen: boolean;
  searchEnginePopoverOpen: boolean;
  bookmarkDialogOpen: boolean;
  createDirDialogOpen: boolean;
  /**
   * 开屏覆盖层是否已隐藏。开屏期间整窗被 DOM 覆盖层盖住，但 DOM 盖不住原生
   * WebView2 子窗口 —— 必须与右侧面板 `hasOverlayActive` 同口径把中心 WebView
   * 移出画面，否则重启后前台标签会在开屏动画阶段直接露出来并遮挡开屏。
   */
  startupOverlayHidden: boolean;
  /**
   * 地址栏展开是工具栏内联展开、不覆盖内容区；保留该字段是为了让回归测试
   * 明确断言“即使展开也不计入 overlay”。实现不得把它并入返回值。
   */
  addressExpanded?: boolean;
}

/** 中心宿主需要把原生 WebView2 移出画面的浮层集合。 */
export function computeCenterOverlayActive(flags: CenterOverlayFlags): boolean {
  return (
    !flags.startupOverlayHidden ||
    flags.browserMenuOpen ||
    flags.searchEnginePopoverOpen ||
    flags.bookmarkDialogOpen ||
    flags.createDirDialogOpen
  );
}
