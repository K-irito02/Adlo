export interface CenterOverlayFlags {
  browserMenuOpen: boolean;
  searchEnginePopoverOpen: boolean;
  bookmarkDialogOpen: boolean;
  createDirDialogOpen: boolean;
  /**
   * 地址栏展开是工具栏内联展开、不覆盖内容区；保留该字段是为了让回归测试
   * 明确断言“即使展开也不计入 overlay”。实现不得把它并入返回值。
   */
  addressExpanded?: boolean;
}

/** 中心宿主需要把原生 WebView2 移出画面的浮层集合。 */
export function computeCenterOverlayActive(flags: CenterOverlayFlags): boolean {
  return (
    flags.browserMenuOpen ||
    flags.searchEnginePopoverOpen ||
    flags.bookmarkDialogOpen ||
    flags.createDirDialogOpen
  );
}
