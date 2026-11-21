// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { exactRuleBody } from './testing/cssRules';

const css = readFileSync(new URL('./components/toast-card.css', import.meta.url), 'utf-8');

/**
 * 右下角提示卡片的布局契约。
 *
 * `ToastCard` 重构为 head（图标+标题+右侧图标按钮）+ body（详情+底部动作）后，
 * 卡片外层不再是横排，`gap` 只在 `__head` 上；摘要卡（`--summary`）仍是横排，
 * 必须自己补回条间距，否则图标/文案/清空按钮会贴在一起（真实回归过）。
 */
describe('toast card layout', () => {
  it('普通卡片纵向排列，间距由 head 承担', () => {
    expect(exactRuleBody(css, '.toast-card')).toContain('flex-direction: column;');
    expect(exactRuleBody(css, '.toast-card__head')).toContain('gap: var(--space-2-5);');
  });

  it('摘要卡保持横排且拥有自己的条间距', () => {
    const summary = exactRuleBody(css, '.toast-card--summary');
    expect(summary).toContain('flex-direction: row;');
    expect(summary).toContain('gap: var(--space-2-5);');
  });

  it('底部动作行靠右对齐卡片内容右缘', () => {
    expect(exactRuleBody(css, '.toast-card__action-row')).toContain('justify-content: flex-end;');
  });
});
