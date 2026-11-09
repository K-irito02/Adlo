/**
 * 自定义布局卡片方块色板。
 *
 * 这里只承担「区分不同窗格」的职责，是**卡片色板，非主题语义色**：
 * 现有设计 token 中没有一组 8 个语义无关、区分度高的颜色，故使用固定色值，
 * 保证亮暗两种主题下每一个窗格都保持稳定、可区分的身份色。前 8 个索引消费
 * 设计 token `--pane-color-1..8`（定义见 `styles/tokens.css`），满足「颜色必须使用
 * `var(--…)`」约束；至少 8 个互不相同的颜色。
 */
export const PANE_COLORS: readonly string[] = [
  'var(--pane-color-1)',
  'var(--pane-color-2)',
  'var(--pane-color-3)',
  'var(--pane-color-4)',
  'var(--pane-color-5)',
  'var(--pane-color-6)',
  'var(--pane-color-7)',
  'var(--pane-color-8)',
];

/**
 * 取某个窗格的颜色，保证「每块各不相同」（spec §9）。
 *
 * 前 `PANE_COLORS.length` 个索引使用策展 token 色板；超出部分按黄金角生成 HSL 色相，
 * 相邻/后续窗格不再取模重复。取 60% 饱和 / 45% 明度；实际前景由主题混合后的
 * `--text-on-pane` 决定（亮色淡彩配深字、暗色深彩配白字），不沿用固定白字假设。
 * 越界（含负数）色相归一化进 0..359，始终返回合法颜色。
 */
const GOLDEN_ANGLE_DEG = 137.508;

export function paneColor(colorIndex: number): string {
  const length = PANE_COLORS.length;
  if (Number.isInteger(colorIndex) && colorIndex >= 0 && colorIndex < length) {
    return PANE_COLORS[colorIndex];
  }
  const hue = ((Math.round(colorIndex * GOLDEN_ANGLE_DEG) % 360) + 360) % 360;
  return `hsl(${hue} 60% 45%)`;
}
