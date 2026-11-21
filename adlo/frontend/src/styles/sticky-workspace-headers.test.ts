// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exactRuleBody, findRuleGroups, ruleBody } from './testing/cssRules';

/**
 * 右侧导航树「工作区标题吸顶」的样式契约（文件 / 变更面板共用）。
 *
 * 行为：当前所在工作区的标题滚到区域顶部后贴顶，下一组到达时把它连续顶出。
 * 关键约束（均由真实预览验证得出，改动前请先读本条注释）：
 * 1. 标题必须 `position: sticky` + `top: 0`；折叠组因容器高度等于自身高度自然随内容滚走；
 * 2. 底色必须不透明：`--bg-hover` / `--bg-active` 是半透明 token，而现有 `.is-current` 规则
 *    用 `background` 简写直接把它们铺在标题上，贴顶时树行会从标题下面透出，因此必须把
 *    底色固定为 `--bg`、清掉简写，再用 `background-image` 叠加半透明态；
 * 3. 标题下不要常驻分隔线（产品明确不要）；
 * 4. 滚动容器顶部内边距置 0，呼吸位改由内容承担，否则贴顶时上方会留一条可穿透内容上移的缝。
 */
function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf-8');
}

/** 与选择器匹配的所有规则体（剥掉注释），拼成一段用于断言。 */
function matchedRuleBodies(css: string, selector: string): string {
  return findRuleGroups(css, selector)
    .map((block) => block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')))
    .map((body) => body.replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n');
}

const css = readRepoFile('./regions/rightpanel/file-tree-browser.css');

const HEADER_SELECTOR = '.adl-multitree--sticky-headers .adl-multitree-entry__header';

/** 选择器与传入值完全一致的规则体（排除 `.is-current` 等复合变体）。 */

describe('工作区标题吸顶样式契约', () => {
  it('标题使用 sticky 且贴顶位置为 0', () => {
    const body = exactRuleBody(css, HEADER_SELECTOR);

    expect(body).not.toBeNull();
    expect(body).toContain('position: sticky');
    expect(body).toContain('top: 0');
    // 高于树行、低于自绘滚动条（z-index: 3），吸顶标题才能盖住滚过的内容。
    expect(body).toContain('z-index: 2');
  });

  it('标题底色不透明，半透明态叠在 background-image 上而非直接当背景色', () => {
    const block = findRuleGroups(css, HEADER_SELECTOR)[0];
    expect(block).toBeDefined();
    const selector = block.slice(0, block.indexOf('{'));
    const body = ruleBody(css, HEADER_SELECTOR);

    // 必须覆盖 `.is-current`（其原有 `background` 简写会把半透明 token 当底色）并清掉简写
    expect(selector).toContain('.adl-multitree-entry.is-current');
    expect(body).toContain('background-color: var(--bg)');
    expect(body).not.toContain('background: var(--bg-hover)');

    // `--bg` 必须是不透明色（rgba 会让树行透出来）。
    const themes = readRepoFile('./themes.css');
    const bgValues = Array.from(themes.matchAll(/--bg:\s*([^;]+);/g)).map((match) =>
      match[1].trim(),
    );
    expect(bgValues.length).toBeGreaterThanOrEqual(2);
    for (const value of bgValues) {
      expect(value).toMatch(/^#|^rgb\(/);
    }

    const tinted = matchedRuleBodies(css, '.adl-multitree--sticky-headers .adl-multitree-entry');
    expect(tinted).toContain('background-image: linear-gradient(var(--bg-hover), var(--bg-hover))');
    expect(tinted).toContain(
      'background-image: linear-gradient(var(--bg-active), var(--bg-active))',
    );
  });

  it('标题不再有常驻分隔线（含 files-panel-list.css 的同名基础规则）', () => {
    for (const block of findRuleGroups(css, HEADER_SELECTOR)) {
      expect(block).not.toContain('border-bottom');
    }
    const duplicateCss = readRepoFile('./regions/rightpanel/files-panel-list.css');
    for (const block of findRuleGroups(duplicateCss, '.adl-multitree-entry__header')) {
      expect(block).not.toContain('border-bottom');
    }
  });

  it('滚动容器顶部内边距归零，呼吸位由内容承担', () => {
    const scrollBody = matchedRuleBodies(css, '.adl-multitree-scroll:has');
    expect(scrollBody).toContain('padding-top: 0');
    // 吸顶标题会盖住滚动区顶部：定位滚动按行预留一个标题高度（不用容器 scroll-padding）。
    expect(scrollBody).not.toContain('scroll-padding-top');
    expect(matchedRuleBodies(css, '.adl-multitree--sticky-headers li[data-path]')).toContain(
      'scroll-margin-top: 34px',
    );
    expect(matchedRuleBodies(css, '.adl-multitree--sticky-headers')).toContain(
      'padding-top: var(--space-1)',
    );
  });
});
