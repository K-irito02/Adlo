// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ruleBody } from '../../../styles/testing/cssRules';

const css = readFileSync(new URL('../StartupOverlay.css', import.meta.url), 'utf-8');
// 注释里会举「animation: 900ms」这类反例说明，断言前先剥注释，避免误命中。
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 有动画的层；新增动画必须同时进 reduced-motion 列表，否则本断言失败。 */
const ANIMATED_LAYERS = [
  '.adl-splash__grid',
  '.adl-splash__grid::before',
  '.adl-splash__mark',
  '.adl-splash__sweep',
  '.adl-splash__sweep--idle',
  '.adl-splash__rule',
  '.adl-splash__name',
];

/** 从 CSS 文本里取出「声明了动画」的规则选择器，用于和 reduced-motion 清单对账。 */
function animatedSelectors(source: string): string[] {
  const selectors: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(source)) !== null) {
    const selector = match[1].trim().replace(/\s+/g, ' ');
    const body = match[2];
    if (/animation\s*:/.test(body) && !/animation\s*:\s*none/.test(body)) {
      selectors.push(selector);
    }
  }
  return selectors;
}

/**
 * 开屏样式锁。
 *
 * 失败模式都是静默的：删掉 reduced-motion 块后 `base.css` 只把 duration 压到 1ms、
 * 不动 delay，名称/细线会在 1.42s / 1.7s 突然蹦出；时长若改成字面量则绕过 token 与
 * 全局塌缩约定；`z-index` 换成魔数会破坏层级契约；网格退回 `background-position`
 * 会把全屏逐帧重绘带回来。这些在组件渲染测试里全绿，只能用 CSS 文本断言锁住。
 */
describe('StartupOverlay splash styles', () => {
  it('keeps every animated layer disabled under reduced motion', () => {
    const media = ruleBody(bare, '@media (prefers-reduced-motion');
    expect(media).not.toBeNull();

    // 从 CSS 反推「实际有动画的层」，再与 reduced-motion 清单对账：
    // 既禁通配符，也保证新增动画（无论加在文件哪个位置）必须同步登记，
    // 否则 reduced-motion 下会漏掉该层。
    expect(animatedSelectors(bare)).toEqual(ANIMATED_LAYERS);

    const declared = media!
      .split('{')[0]
      .split(',')
      .map((selector) => selector.trim())
      .filter(Boolean);
    expect(declared).toEqual(ANIMATED_LAYERS);

    for (const selector of declared) {
      expect(ruleBody(media!, selector)).toContain('animation: none;');
    }
    // 同特异度 + 源序在后即可胜出，不需要 `!important`。
    expect(media).not.toMatch(/animation:[^;]*!important/);
  });

  it('drives every animation from the splash tokens', () => {
    // 扫全文件（含媒体块之后），只排除媒体块里合法的 `animation: none;`：
    // 追加在第 8 处、带字面量的动画同样必须被抓住。
    const declarations = [...bare.matchAll(/animation:\s*([^;]*);/g)]
      .map((match) => match[1].trim())
      .filter((declaration) => declaration !== 'none');

    // 7 段编排：网格入场 / 网格漂移 / 图标落定 / 掠光 / 弱掠光 / 细线 / 名称。
    expect(declarations).toHaveLength(7);
    for (const declaration of declarations) {
      expect(declaration).toContain('var(--splash-');
      // 简写里的时长/延迟一律不得是字面量。
      expect(declaration).not.toMatch(/\b\d+(\.\d+)?m?s\b/);
    }
    // 长写同样禁止字面量（`animation-duration: 900ms` 会绕过上面的简写检查）。
    expect(bare).not.toMatch(/animation-(duration|delay):\s*[\d.]/);
  });

  it('keeps the overlay on the shared top z-index token', () => {
    expect(ruleBody(bare, '.adl-splash')).toContain('z-index: var(--z-max);');
  });

  it('moves the grid with transform instead of repainting background-position', () => {
    // 漂移必须挂在网格贴图层（::before）上，且位移正好一个 32px 周期。
    expect(ruleBody(bare, '.adl-splash__grid::before')).toContain('adl-splash-grid-drift');

    const drift = ruleBody(bare, '@keyframes adl-splash-grid-drift');
    expect(drift).not.toBeNull();
    expect(drift).toMatch(/translate3d\(\s*32px\s*,\s*32px/);
    expect(drift).not.toContain('background-position');
  });
});
