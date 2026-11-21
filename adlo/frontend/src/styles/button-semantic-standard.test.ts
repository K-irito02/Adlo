// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ruleBody } from './testing/cssRules';

const buttonCss = readFileSync(new URL('./components/button.css', import.meta.url), 'utf-8');
const themesCss = readFileSync(new URL('./themes.css', import.meta.url), 'utf-8');

describe('按钮语义色与加载态标准（石墨墨水 / 全柔和 / 2px / 扫光）', () => {
  it('实心 primary/danger 消费石墨 token，不再直接使用品牌蓝/鲑红', () => {
    const primary = ruleBody(buttonCss, '.adl-btn--primary');
    expect(primary).toContain('--btn-bg: var(--btn-primary)');
    expect(primary).not.toContain('--accent');
    const danger = ruleBody(buttonCss, '.adl-btn--danger');
    expect(danger).toContain('--btn-bg: var(--btn-danger)');
    expect(danger).not.toContain('--danger)');
  });

  it('新增 5 个柔和语义变体', () => {
    for (const tone of ['primary', 'danger', 'warning', 'success', 'neutral']) {
      expect(ruleBody(buttonCss, `.adl-btn--${tone}-soft`)).not.toBeNull();
    }
  });

  it('按钮圆角 token 在亮暗两套主题均为 2px', () => {
    expect(ruleBody(themesCss, ':root')).toContain('--btn-radius: 2px');
    expect(ruleBody(themesCss, "[data-theme='dark']")).toContain('--btn-radius: 2px');
  });

  it('忙碌按钮使用文字扫光，不再保留圆圈 spinner', () => {
    const busy = ruleBody(buttonCss, ".adl-btn[aria-busy='true']");
    expect(busy).toContain('background-clip: text');
    expect(busy).toContain('adl-text-shimmer');
    expect(buttonCss).not.toContain(".btn[aria-busy='true']::after");
  });
});
