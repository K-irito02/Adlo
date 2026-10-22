// @vitest-environment node
// 本文件 ruleBody 只支持单选择器精确匹配（无分组/嵌套处理）；被测 DSH 规则均为
// 单选择器，如需断言共享分组选择器请用 workspace-settings.test.ts 的 groupRuleBody。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const dshCss = readFileSync(new URL('./regions/dsh-version.css', import.meta.url), 'utf-8');
const settingsCss = readFileSync(new URL('./components/settings.css', import.meta.url), 'utf-8');

/**
 * 收集所有「声明了 needle 的规则」的选择器组文本（已剥离注释）。
 * 分组规则（`.a,\n.b { ... }`）会整组返回，避免用字面量锁死换行与顺序。
 */
function selectorGroupsWith(css: string, needle: string): string[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  let prev = 0;
  for (let i = 0; i < stripped.length; i += 1) {
    if (stripped[i] !== '}') {
      continue;
    }
    const block = stripped.slice(prev, i);
    const brace = block.indexOf('{');
    if (brace !== -1 && block.slice(brace).includes(needle)) {
      out.push(block.slice(0, brace).trim());
    }
    prev = i + 1;
  }
  return out;
}

/** 分组选择器文本是否**精确**包含某个选择器（按 `,` 拆开后 trim 比较，避免子串误判）。 */
function groupHasSelector(group: string, selector: string): boolean {
  return group
    .split(',')
    .map((part) => part.trim())
    .includes(selector);
}

function ruleBody(css: string, selector: string): string | null {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    return null;
  }
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('dsh settings styles (control widths + test button centering)', () => {
  it('fixes the dropdown and the test button to the same width (160px)', () => {
    const dropdown = ruleBody(dshCss, '.adl-dsh-settings .adl-settings-dropdown');
    expect(dropdown).not.toBeNull();
    expect(dropdown).toContain('width: 160px');
    expect(dropdown).toContain('min-width: 160px');
    const button = ruleBody(dshCss, '.adl-dsh-settings__test-button');
    expect(button).not.toBeNull();
    expect(button).toContain('width: 160px');
    expect(button).toContain('min-width: 160px');
  });

  it('relies on the shared value class for result ellipsis (locks the dependency)', () => {
    // 省略规则由 settings.css 共享类提供，dsh-version.css 不重复声明；此处锁定依赖不断。
    const shared = ruleBody(settingsCss, '.adl-settings-dropdown__value');
    expect(shared).not.toBeNull();
    expect(shared).toContain('overflow: hidden');
    expect(shared).toContain('text-overflow: ellipsis');
    expect(shared).toContain('white-space: nowrap');
    // 按钮是 inline-flex，内层 span 为 flex item：缺 min-width:0 会被内容撑开，
    // 省略号永不触发（事项 11 Phase 4 A2-R2-B1）。
    const value = ruleBody(dshCss, '.adl-dsh-settings__test-button .adl-settings-dropdown__value');
    expect(value).not.toBeNull();
    expect(value).toContain('min-width: 0');
  });

  it('centers the test button content (label, testing and result states)', () => {
    const body = ruleBody(dshCss, '.adl-dsh-settings__test-button');
    expect(body).not.toBeNull();
    expect(body).toContain('justify-content: center');
  });

  it('centers the inner value text', () => {
    const body = ruleBody(dshCss, '.adl-dsh-settings__test-button .adl-settings-dropdown__value');
    expect(body).not.toBeNull();
    expect(body).toContain('text-align: center');
  });

  it('keeps success/error result colors on the value text', () => {
    const success = ruleBody(
      dshCss,
      '.adl-dsh-settings__test-button .adl-settings-dropdown__value.is-success',
    );
    const error = ruleBody(
      dshCss,
      '.adl-dsh-settings__test-button .adl-settings-dropdown__value.is-error',
    );
    expect(success).not.toBeNull();
    expect(error).not.toBeNull();
    expect(success).toContain('var(--pastel-success-fg)');
    expect(error).toContain('var(--pastel-danger-fg)');
  });

  it('keeps the decorative header icon dim (disabled-like, non-interactive)', () => {
    const body = ruleBody(settingsCss, '.adl-settings-row__reset--static');
    expect(body).not.toBeNull();
    expect(body).toContain('var(--text-muted)');
    expect(body).toContain('opacity: 0.5');
    const hover = ruleBody(settingsCss, '.adl-settings-row__reset--static:hover');
    expect(hover).not.toBeNull();
    expect(hover).toContain('background: transparent');
  });

  it('uses the dsh note token for row warnings in scope (no raw color)', () => {
    // 块内蓝色文字统一走 `--dsh-note-fg`（当前版本徽章 / 当前版本行 / 提示小字同色）：
    // token 由 `--accent` 混合压暗而成，不再是写死的 `#80b0f5`（用户 2026-10-22：
    // 提示小字比徽章亮，要求对齐）。
    const token = ruleBody(dshCss, '.adl-dsh-settings__version-menu');
    expect(token).not.toBeNull();
    expect(token).toContain('--dsh-note-fg: color-mix(');
    expect(token).toContain('var(--accent)');
    // Portal 菜单面板必须与块根共用同一份 token 定义：菜单挂在 <body> 下，不在
    // `.adl-dsh-settings` 子树内，漏一处则菜单里的徽章取不到变量、退回继承色
    // （用户 2026-10-22 实测「菜单卡片徽章与按钮徽章不同色」）。
    // 精确按选择器比对（不能用子串：`.adl-dsh-settings__version-menu` 也以
    // `.adl-dsh-settings` 开头，子串判定会在删掉块根后仍然通过 —— R1 rev2 N-02）。
    const lightScopes = selectorGroupsWith(dshCss, '--dsh-note-fg:');
    expect(lightScopes.some((g) => groupHasSelector(g, '.adl-dsh-settings'))).toBe(true);
    expect(lightScopes.some((g) => groupHasSelector(g, '.adl-dsh-settings__version-menu'))).toBe(
      true,
    );
    // 暗色主题单独再压一档（`--accent` 在暗色下亮度高，单一混合比压不住），同样两处都覆盖。
    const darkScopes = selectorGroupsWith(dshCss, '--dsh-note-fg:').filter((g) =>
      groupHasSelector(g, "[data-theme='dark'] .adl-dsh-settings"),
    );
    expect(darkScopes).toHaveLength(1);
    expect(groupHasSelector(darkScopes[0]!, "[data-theme='dark'] .adl-dsh-settings")).toBe(true);
    expect(
      groupHasSelector(darkScopes[0]!, "[data-theme='dark'] .adl-dsh-settings__version-menu"),
    ).toBe(true);
    // 作用域限定：token 定义在 .adl-dsh-settings 上，使用处必须同在子树内，
    // 否则其它面板的 row-warn 会丢色（用全局 var(--warning) 的原规则无此问题）。
    const warn = ruleBody(
      dshCss,
      '.adl-dsh-settings .adl-settings-row__label small.adl-dsh-settings__row-warn',
    );
    expect(warn).not.toBeNull();
    expect(warn).toContain('color: var(--dsh-note-fg)');
    expect(warn).not.toContain('#80b0f5');
    // 多行蓝色提示按原文换行（事项 2026-10-20/5）：pre-line + 解除 5 行 clamp。
    expect(warn).toContain('white-space: pre-line');
    expect(warn).toContain('line-clamp: unset');
  });

  it('paints the current-version badge with the shared note token', () => {
    // 徽章必须精确出现在「使用 --dsh-note-fg 的分组」里（删掉该选择器 → 徽章退回
    // --text-secondary，正是「菜单徽章与按钮不同色」的复发路径 —— R1 rev2 N-01）。
    const groups = selectorGroupsWith(dshCss, 'color: var(--dsh-note-fg)');
    expect(
      groups.some((g) => groupHasSelector(g, '.adl-dsh-settings__version-menu-item-current')),
    ).toBe(true);
    // 文件内不得再有裸 `color: var(--accent)` 的蓝色文字。
    expect(dshCss).not.toMatch(/color:\s*var\(--accent\)/);
  });

  it('renders the version task as stage text with shimmer (no progress bar)', () => {
    // 任务行已改为纯阶段文案＋取消按钮（用户明确要求去掉进度条/百分比/时间戳）：
    // 旧 progress 体系必须整体消失，否则悬空样式无人用。
    expect(dshCss).not.toContain('.adl-dsh-settings__progress');
    const stage = ruleBody(dshCss, '.adl-dsh-settings__version-task-stage');
    expect(stage).not.toBeNull();
    expect(stage).toContain('white-space: nowrap');
    // 扫光只作用于文字：background-clip:text + 透明字色，中性灰两端保证亮暗主题可见。
    const shimmer = ruleBody(dshCss, '.adl-dsh-settings__version-task-shimmer');
    expect(shimmer).not.toBeNull();
    expect(shimmer).toContain('background-clip: text');
    expect(shimmer).toContain('color: transparent');
    const count = ruleBody(dshCss, '.adl-dsh-settings__version-task-count');
    expect(count).not.toBeNull();
  });
});
