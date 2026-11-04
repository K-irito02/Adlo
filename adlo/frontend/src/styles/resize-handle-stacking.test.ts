// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { findRuleGroups } from './testing/cssRules';

/**
 * 面板边缘拖拽线 vs 悬浮层（对话框/菜单）的堆叠与命中区契约。
 *
 * 回归对象（2026-09-30 实测）：`.adl-rightpanel__resize-handle` 曾用 14px 可交互
 * 容器 + `z-index: var(--z-tooltip)`(90)，高于剪贴板确认框 `.adl-prompt-modal`
 * 的 `var(--z-modal-backdrop)`(50) —— 鼠标悬停确认框时命中区穿透触发拖拽线。
 *
 * 契约（与 `.adl-tool-navigator__resize-handle` / `.adl-leftbar__resize-handle` 一致）：
 * 1. 容器 `pointer-events: none`（整条宽列不得吃指针事件）；
 * 2. 仅 `::before`（可见细线）`pointer-events: auto`；
 * 3. 生效 `z-index` 严格低于 `--z-modal-backdrop`，任何弹层都能盖住并拦截命中。
 */
function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf-8');
}

const tokensCss = readRepoFile('./tokens.css');
const filesPanelCoreCss = readRepoFile('./regions/rightpanel/files-panel-core.css');
const filesNavigatorCss = readRepoFile('./regions/rightpanel/files-navigator.css');
const leftbarCss = readRepoFile('./regions/leftbar.css');

/** 规则体：选择器作为一个完整片段出现的规则（含复合选择器），剥掉体内注释。 */
function ruleBodies(css: string, selector: string): string[] {
  return findRuleGroups(css, selector)
    .filter((block) =>
      block
        .slice(0, block.indexOf('{'))
        .trim()
        .split(/[\s>+~]+/)
        .includes(selector),
    )
    .map((block) =>
      block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')).replace(/\/\*[\s\S]*?\*\//g, ''),
    );
}

/** 级联后最后一个声明值（同属性多条声明后者胜出）。 */
function lastDeclaration(css: string, selector: string, property: string): string | null {
  const pattern = new RegExp(`(?<![\\w-])${property}\\s*:\\s*([^;]+);`, 'g');
  const values = ruleBodies(css, selector).flatMap((body) =>
    [...body.matchAll(pattern)].map((match) => match[1].trim()),
  );
  return values.length > 0 ? values[values.length - 1] : null;
}

function zToken(name: string): number {
  const matched = new RegExp(`--${name}:\\s*(\\d+)\\s*;`).exec(tokensCss);
  expect(matched, `tokens.css missing --${name}`).not.toBeNull();
  return Number(matched![1]);
}

function zValueOf(css: string, selector: string): number {
  const value = lastDeclaration(css, selector, 'z-index');
  expect(value, `${selector} has no z-index`).not.toBeNull();
  const token = value ? /var\(--(z-[a-z-]+)\)/.exec(value) : null;
  return token ? zToken(token[1]) : Number(value);
}

const HANDLES: readonly { css: string; selector: string }[] = [
  { css: filesPanelCoreCss, selector: '.adl-rightpanel__resize-handle' },
  { css: filesNavigatorCss, selector: '.adl-tool-navigator__resize-handle' },
  { css: leftbarCss, selector: '.adl-leftbar__resize-handle' },
];

describe('panel resize handles vs overlays', () => {
  it('keeps every edge resize handle below the modal backdrop layer', () => {
    const backdropZ = zToken('z-modal-backdrop');
    for (const { css, selector } of HANDLES) {
      expect(zValueOf(css, selector), `${selector} must sit below the modal backdrop`).toBeLessThan(
        backdropZ,
      );
    }
  });

  it('right-panel handle no longer uses the tooltip layer', () => {
    // 级联感知 + 注释免疫：取生效值而非原文正则，后置覆盖也能拦住。
    expect(
      lastDeclaration(filesPanelCoreCss, '.adl-rightpanel__resize-handle', 'z-index'),
    ).not.toBe('var(--z-tooltip)');
  });

  it('keeps the interactive hit area on the ::before line only', () => {
    for (const { css, selector } of HANDLES) {
      expect(lastDeclaration(css, selector, 'pointer-events'), `${selector} container`).toBe(
        'none',
      );
      expect(
        lastDeclaration(css, `${selector}::before`, 'pointer-events'),
        `${selector}::before`,
      ).toBe('auto');
    }
  });
});
