// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * 设置面板「浮层 vs 导航拖拽线」的堆叠与命中区契约。
 *
 * 回归对象（2026-09-29 实测）：搜索历史卡片从头部溢出到内容区之上，而设置导航的拖拽线
 * 与头部曾同为 `z-index: --z-raised` 且拖拽线在 DOM 中位于头部之后 —— 同层后者胜，
 * 拖拽线画在卡片之上并抢走指针事件（悬停卡片时拖拽线亮起、按下即开始拉伸）。
 *
 * 断言方式：
 * - 规则体用**注释感知 + 收集全部命中**的 `findRuleGroups`（同目录
 *   `center-reveal-scroll.test.ts` 的口径），再取「级联后最后一个声明」，避免
 *   「后置重复规则静默改写生效值而守卫仍绿」；
 * - 层级关系按 `tokens.css` 的**数值**比较，而不是钉字面量 —— token 表改序也能拦住。
 */
/** 读取仓库内的文件原文（CSS 注释由 `findRuleGroups` 的注释感知处理）。 */
function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf-8');
}

const tokensCss = readRepoFile('./tokens.css');
const settingsCss = readRepoFile('./components/settings.css');
const filesNavigatorCss = readRepoFile('./regions/rightpanel/files-navigator.css');
const settingsPanelSource = readRepoFile('../app/components/settings/SettingsPanel.tsx');

function findRuleGroups(css: string, selector: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  while (from < css.length) {
    const open = css.indexOf(selector, from);
    if (open === -1) {
      break;
    }
    from = open + selector.length;
    const lastCommentEnd = css.lastIndexOf('*/', open);
    const lastCommentStart = css.lastIndexOf('/*', open);
    if (lastCommentStart > lastCommentEnd) {
      continue;
    }
    const prev = open === 0 ? '' : css[open - 1];
    if (prev && !/[\s,{>+~]/.test(prev)) {
      continue;
    }
    const groupStart = Math.max(css.lastIndexOf('}', open), css.lastIndexOf(';', open)) + 1;
    const bodyStart = css.indexOf('{', open);
    if (bodyStart === -1) {
      break;
    }
    let depth = 1;
    let i = bodyStart + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') {
        depth += 1;
      } else if (css[i] === '}') {
        depth -= 1;
      }
      i += 1;
    }
    blocks.push(css.slice(groupStart, i));
  }
  return blocks;
}

/**
 * 规则体：选择器里**作为一个完整片段**出现目标选择器的规则都算（含 `.panel .foo` 这类
 * 高特异度组合；`::before` 也算 —— 调用方传 `.foo::before` 时按整段匹配）。
 * 按组合符切分后逐段等值比较，故 `.foo__item`（另一个类）与 `.foo.bar`（复合片段）不会误入。
 * 用途：级联里真正生效的可能是高特异度规则，只查「选择器逐字相等」会漏。
 */
function ruleBodies(css: string, selector: string): string[] {
  return (
    findRuleGroups(css, selector)
      .filter((block) =>
        block
          .slice(0, block.indexOf('{'))
          .trim()
          .split(/[\s>+~]+/)
          .includes(selector),
      )
      // 剥掉规则体内注释：注释里出现「属性: 值」字样（如解释性文字）不得算作生效声明。
      .map((block) =>
        block
          .slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
          .replace(/\/\*[\s\S]*?\*\//g, ''),
      )
  );
}

/**
 * 级联后**最后一个**声明值（同一属性多条声明时后者胜出）。
 * 属性名按词边界匹配：`border-width` / `min-width` 不得算作 `width`。
 */
function lastDeclaration(css: string, selector: string, property: string): string | null {
  const pattern = new RegExp(`(?<![\\w-])${property}\\s*:\\s*([^;]+);`, 'g');
  const values = ruleBodies(css, selector).flatMap((body) =>
    [...body.matchAll(pattern)].map((match) => match[1].trim()),
  );
  return values.length > 0 ? values[values.length - 1] : null;
}

/** z-index token 的数值（`--z-raised: 10;` → 10）。 */
function zToken(name: string): number {
  const matched = new RegExp(`--${name}:\\s*(\\d+)\\s*;`).exec(tokensCss);
  expect(matched, `tokens.css missing --${name}`).not.toBeNull();
  return Number(matched![1]);
}

/** 取声明里的 z-index 数值：`var(--z-dropdown)` 查 token 表，字面量直接取值。 */
function zValueOf(css: string, selector: string): number {
  const value = lastDeclaration(css, selector, 'z-index');
  expect(value, `${selector} has no z-index`).not.toBeNull();
  const token = value ? /var\(--(z-[a-z-]+)\)/.exec(value) : null;
  return token ? zToken(token[1]) : Number(value);
}

describe('settings panel overlay stacking', () => {
  it('keeps the header above the navigator resize handle layer', () => {
    expect(lastDeclaration(settingsCss, '.adl-settings-panel__header', 'position')).toBe(
      'relative',
    );
    // 层级关系而非字面量：头部生效值必须严格大于拖拽线的生效值（拖拽线在 DOM 中位于其后）。
    const headerZ = zValueOf(settingsCss, '.adl-settings-panel__header');
    const handleZ = zValueOf(filesNavigatorCss, '.adl-tool-navigator__resize-handle');
    expect(headerZ).toBeGreaterThan(handleZ);
    // 且仍低于对话框遮罩：浮层不得压过确认框。
    expect(headerZ).toBeLessThan(zToken('z-modal-backdrop'));
  });

  it('reuses the shared navigator resize handle instead of a settings-local copy', () => {
    // 标记绑定：挂共享类，或用共享组件 `NavigatorResizeHandle`（它内部就渲染该类）
    // —— 二者取一即可，避免「CSS 断言的类名无人使用」时契约静默脱离。
    expect(
      /adl-tool-navigator__resize-handle|NavigatorResizeHandle/.test(settingsPanelSource),
    ).toBe(true);
    expect(settingsPanelSource).not.toContain('adl-settings-nav__resize-handle');
    // 不再自带一份同规格规则（避免与文件/变更/左侧栏出现两份口径）。
    expect(findRuleGroups(settingsCss, '.adl-settings-nav__resize-handle')).toEqual([]);
  });

  it('keeps the shared resize hit area on the 3px line only', () => {
    // 容器不吃指针事件：整条 12px 宽的高列若可命中，会压住任何与它重叠的浮层。
    expect(
      lastDeclaration(filesNavigatorCss, '.adl-tool-navigator__resize-handle', 'pointer-events'),
    ).toBe('none');
    const line = '.adl-tool-navigator__resize-handle::before';
    expect(lastDeclaration(filesNavigatorCss, line, 'width')).toBe('3px');
    expect(lastDeclaration(filesNavigatorCss, line, 'pointer-events')).toBe('auto');
  });

  it('caps the search history card at the search-field scale, not the old 320px', () => {
    const card = '.adl-settings-search-history';
    const width = lastDeclaration(settingsCss, card, 'width');
    expect(width, `${card} has no width declaration`).not.toBeNull();
    expect(width).toContain('min(');
    const matched = /min\((\d+)px,/.exec(width!);
    // 上界必须写成 `min(<数字>px, …)`：否则下面的数值断言会静默跳过（用变量首参也不例外）。
    expect(matched, `unexpected width expression: ${width}`).not.toBeNull();
    const cap = Number(matched![1]);
    // 数值上界：不小于搜索框尺度（160），且不得回到 300+ 的宽卡片（320 一律红）。
    expect(cap).toBeGreaterThanOrEqual(160);
    expect(cap).toBeLessThanOrEqual(240);
    // 上界与 min-width 打架（min-width 会胜出）→ 不得再声明 min-width；层级由头部承担，卡片不再自带 z-index。
    expect(lastDeclaration(settingsCss, card, 'min-width')).toBeNull();
    expect(lastDeclaration(settingsCss, card, 'z-index')).toBeNull();
  });
});
