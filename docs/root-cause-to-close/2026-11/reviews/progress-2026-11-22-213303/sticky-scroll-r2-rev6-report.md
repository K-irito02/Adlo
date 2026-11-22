# sticky-scroll — R2 rev6 归档重建

> 原报告在 P6 清理时误删；以下依据会话中的复审摘要重建，非逐字原文。

- 范围：rev6 仅 4 个 sticky 文件变化。
- 复核：`StickyContextProvider` / `subscribeToEditor` / `contentKeyRef` / `_changesPanelSource` 零残留；`canScrollToTop` 删除自洽；`.is-hidden` 仅留 `opacity`，隐藏行仍由子级 `pointer-events:none` 断命中；ui-probe 复测通过。
- 结论：需修复项：0
