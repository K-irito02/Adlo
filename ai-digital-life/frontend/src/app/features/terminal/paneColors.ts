/**
 * 自定义布局卡片方块色板。
 *
 * 这里只承担「区分不同窗格」的职责，是**卡片色板，非主题语义色**：
 * 现有设计 token 中没有一组 8 个语义无关、区分度高的颜色，故使用固定 hex，
 * 保证亮暗两种主题下每一个窗格都保持稳定、可区分的身份色。
 * 至少 8 个互不相同的颜色。
 */
export const PANE_COLORS: readonly string[] = [
  '#e5484d', // 红
  '#f76b15', // 橙
  '#f5b700', // 黄
  '#30a46c', // 绿
  '#12a594', // 青
  '#0091ff', // 蓝
  '#6e56cf', // 紫
  '#d6409f', // 品红
];

/**
 * 取某个窗格的颜色；越界（含负数）按调色板长度取模，保证始终返回合法颜色。
 */
export function paneColor(colorIndex: number): string {
  const length = PANE_COLORS.length;
  return PANE_COLORS[((colorIndex % length) + length) % length];
}
