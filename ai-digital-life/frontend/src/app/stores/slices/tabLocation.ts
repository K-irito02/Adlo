export type TabLocation = 'panel' | 'center';

/** 标签是否位于右侧面板（缺省即面板）。中心标签为 `'center'`。 */
export function isPanelTab(tab: { location?: TabLocation }): boolean {
  return tab.location !== 'center';
}
