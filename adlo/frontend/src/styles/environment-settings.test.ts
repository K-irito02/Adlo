// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ruleBody } from './testing/cssRules';

const css = readFileSync(new URL('./regions/environment-settings.css', import.meta.url), 'utf-8');

/**
 * 环境组行距/分隔线的样式锁。
 *
 * 失败模式是静默的：依赖以 `<section>` 分组后，全局 `.adl-settings-row` 的
 * `:first-child/:last-child` 收边会把每个依赖的上下 padding 与分隔线吃掉，
 * 行与行粘连、分组语义倒置——而组件测试只看文案/DOM 结构，拦不住。
 */
describe('environment settings section rhythm styles', () => {
  const SECTION = '.adl-environment-settings .adl-settings-card > section';

  it('moves the divider and vertical rhythm onto the dependency section', () => {
    const body = ruleBody(css, SECTION);
    expect(body).not.toBeNull();
    expect(body).toContain('padding: var(--space-3-5) 0');
    expect(body).toContain('border-bottom: 1px solid var(--border-subtle)');
    // 首/末 section 仍按卡片边界收边。
    expect(ruleBody(css, `${SECTION}:first-child`)).toContain('padding-top: 0');
    const last = ruleBody(css, `${SECTION}:last-child`);
    expect(last).toContain('padding-bottom: 0');
    expect(last).toContain('border-bottom: none');
  });

  it('neutralizes per-row first/last trimming inside a section', () => {
    const row = ruleBody(css, `${SECTION} > .adl-settings-row`);
    expect(row).not.toBeNull();
    expect(row).toContain('padding-top: 0');
    expect(row).toContain('padding-bottom: 0');
    expect(row).toContain('border-bottom: none');
    // 主体行 → 自定义路径次级行：仅留呼吸，不画分隔线（分隔线属于依赖边界）。
    const sub = ruleBody(css, `${SECTION} > .adl-settings-row + .adl-settings-row`);
    expect(sub).not.toBeNull();
    expect(sub).toContain('padding-top: var(--space-2)');
  });
});
