// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ruleBody } from './testing/cssRules';

const css = readFileSync(new URL('./components/loading-row.css', import.meta.url), 'utf-8');

const normalizedLines = (body: string) => body.split('\n').map((line) => line.trim());

/**
 * 加载文案扫光的样式锁。
 *
 * 唯一失败模式是静默的：删掉设置面板作用域的复合选择器后，`color: transparent` 被
 * `.adl-settings-row__label small`（0-1-1）压掉，DOM 文案照旧、组件测试全绿，只是
 * 扫光"看不见"。这里把选择器与关键声明变成可执行约束。
 */
describe('loading row text shimmer styles', () => {
  const COMPOUND = '.adl-settings-row__label small.adl-loading-row__text--shimmer';

  it('keeps the settings-scoped compound selector in the shimmer rule group', () => {
    const body = ruleBody(css, COMPOUND);
    expect(body).not.toBeNull();
    const lines = normalizedLines(body!);
    expect(lines).toContain('color: transparent;');
    // 渐变本体与尺寸任一丢失都会让"扫光"变成透明/静态文本。
    expect(body).toContain('linear-gradient(');
    expect(lines).toContain('background-size: 300% 100%;');
    // 两条按整行精确匹配：`-webkit-background-clip: text;` 不能替 `background-clip: text;` 过关。
    expect(lines).toContain('background-clip: text;');
    expect(lines).toContain('-webkit-background-clip: text;');
    expect(lines).toContain('animation: adl-text-shimmer 2s ease-in-out infinite;');
  });

  it('keeps the keyframes that actually move the gradient', () => {
    const keyframes = ruleBody(css, '@keyframes adl-text-shimmer');
    expect(keyframes).not.toBeNull();
    expect(keyframes).toContain('background-position');
    expect(keyframes).toContain('200% center');
    expect(keyframes).toContain('-200% center');
  });

  it('keeps the reduced-motion fallback inside the media block', () => {
    const mediaBody = ruleBody(css, '@media (prefers-reduced-motion');
    expect(mediaBody).not.toBeNull();
    // 从媒体查询块体内取规则：证明 fallback 确实在 @media 内，而不是文件尾部同名规则。
    const rule = ruleBody(mediaBody!, COMPOUND);
    expect(rule).not.toBeNull();
    expect(rule).toContain('animation: none;');
    expect(rule).toContain('color: var(--text-muted);');
    expect(rule).toContain('background: none;');
  });

  it('includes the workspace busy compound selector in the reduced-motion fallback', () => {
    const busy = '.adl-multitree-entry__busy.adl-loading-row__text--shimmer';
    const mediaBody = ruleBody(css, '@media (prefers-reduced-motion');
    expect(mediaBody).not.toBeNull();
    const rule = ruleBody(mediaBody!, busy);
    expect(rule).not.toBeNull();
    expect(rule).toContain('animation: none;');
    expect(rule).toContain('color: var(--text-muted);');
    expect(rule).toContain('background: none;');
  });
});
