/** 设置行容器上的定位属性：值 = 该行的主文案（与索引 `SettingsSearchDetail.locate` 同源）。 */
export const SETTINGS_ROW_ATTRIBUTE = 'data-settings-row';

/**
 * 在面板主内容区里按定位文案取设置行元素。
 *
 * 用途：设置搜索的结果一条对应一个**块**（块主标题为结果标题），但当命中来自块内某行的
 * 副标题/提示说明时，落点应当落到**那一行**而非块主标题 —— 本函数就是「行文案 → 行元素」的
 * 解析。定位值是 i18n 文案本身，故按属性值等值比较（不用 CSS 选择器，免去文案里的
 * 引号/反斜杠转义问题）；找不到返回 null，由调用方回退到块锚点。
 *
 * 逐帧全扫 `[data-settings-row]` 是可接受的：行数有界（当前约 30），且调用方只在跳转的
 * 有界等待窗口内调用，最坏 2s 后放弃。
 */
export function findSettingsRow(root: HTMLElement | null, locateText?: string): HTMLElement | null {
  if (!root || !locateText) {
    return null;
  }
  const rows = root.querySelectorAll<HTMLElement>(`[${SETTINGS_ROW_ATTRIBUTE}]`);
  for (const row of rows) {
    if (row.getAttribute(SETTINGS_ROW_ATTRIBUTE) === locateText) {
      return row;
    }
  }
  return null;
}
