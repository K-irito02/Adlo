// @vitest-environment node
// 本文件 ruleBody 只支持单选择器精确匹配（无分组/嵌套处理）；被测规则均为单选择器。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const settingsCss = readFileSync(new URL('./components/settings.css', import.meta.url), 'utf-8');

function ruleBody(css: string, selector: string): string | null {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    return null;
  }
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

/**
 * 设置面板「浮层 vs 导航拖拽线」的堆叠与命中区契约。
 *
 * 回归对象（2026-09-29 实测）：搜索历史卡片从头部溢出到内容区之上，而设置导航的拖拽线
 * `.adl-settings-nav__resize-handle` 是 `z-index: --z-raised` 且在 DOM 中位于头部**之后** ——
 * 头部若同为 `--z-raised`，同层时后者胜，拖拽线画在卡片之上并抢走指针事件
 * （悬停卡片时拖拽线亮起、按下即开始拉伸）。
 */
describe('settings panel overlay stacking', () => {
  it('keeps the header above the navigator resize handle layer', () => {
    const header = ruleBody(settingsCss, '.adl-settings-panel__header');
    expect(header).not.toBeNull();
    // 必须高于 --z-raised（拖拽线所在层），否则卡片会被拖拽线抢指针事件。
    expect(header).toContain('position: relative');
    expect(header).toContain('z-index: var(--z-dropdown)');
    expect(header).not.toContain('z-index: var(--z-raised)');
  });

  it('keeps the navigator resize hit area on the 3px line only (aligned with the shared handle)', () => {
    const handle = ruleBody(settingsCss, '.adl-settings-nav__resize-handle');
    expect(handle).not.toBeNull();
    // 容器不吃指针事件：整条 12px 宽的高列若可命中，会压住任何与它重叠的浮层。
    expect(handle).toContain('pointer-events: none');
    const line = ruleBody(settingsCss, '.adl-settings-nav__resize-handle::before');
    expect(line).not.toBeNull();
    expect(line).toContain('width: 3px');
    expect(line).toContain('pointer-events: auto');
  });

  it('caps the search history card at the search-field scale, not the old 320px', () => {
    const card = ruleBody(settingsCss, '.adl-settings-search-history');
    expect(card).not.toBeNull();
    // 卡片只是「历史提示」：比搜索框（输入框 120px / 容器约 150px）略宽即可。
    expect(card).toContain('width: min(200px,');
    expect(card).not.toContain('width: min(320px,');
  });
});
