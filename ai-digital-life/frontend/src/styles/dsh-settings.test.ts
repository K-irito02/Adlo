// @vitest-environment node
// 本文件同时提供 ruleBody（单选择器规则体，不处理逗号分组/嵌套）与
// selectorGroupsWith/groupHasSelector（按声明反查逗号分组选择器）；涉及本文件的 DSH
// 规则可任选其一，跨文件「主文字色」类断言用分组 helper 更稳。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ruleBody } from './testing/cssRules';

const dshCss = readFileSync(new URL('./regions/dsh-settings.css', import.meta.url), 'utf-8');
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
    // 省略规则由 settings.css 共享类提供，dsh-settings.css 不重复声明；此处锁定依赖不断。
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

  it('retires the legacy version-card rules together with the old component', () => {
    // 旧 DSH 版本组件已删除：其专属类名不得在本表复活（版本卡片改用
    // `harness-version.css` 的 `adl-harness-version__*` 类名）。
    expect(dshCss).not.toMatch(/\.adl-dsh-settings__version-(menu|readout|list|picker|sizer)/);
    expect(dshCss).not.toMatch(/\.adl-dsh-settings__(badge|row--stack|row-warn)/);
    expect(dshCss).not.toContain('.adl-dsh-source-dialog__message');
  });

  it('renders the task row as stage text with shimmer (no progress bar)', () => {
    // 任务行是纯阶段文案＋取消按钮（用户明确要求去掉进度条/百分比/时间戳）：
    // 旧 progress 体系必须整体消失，否则悬空样式无人用。任务行现由环境组复用。
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

describe('dsh settings source summary styles', () => {
  it('paints the summary mode hint muted without shrinking it', () => {
    // 需求（2026-10-25）：摘要行尾部模式提示用中性灰，前面的名称 + 源地址文本保持主文字色。
    // 失败模式是静默的：规则被删/被更特异的选择器压掉时，DOM 文案不变、组件测试全绿。
    const mode = ruleBody(
      dshCss,
      '.adl-dsh-settings .adl-settings-row__label-text .adl-dsh-settings__source-mode',
    );
    expect(mode).not.toBeNull();
    expect(mode).toContain('color: var(--text-muted)');
    expect(mode).toContain('font-weight: var(--font-normal)');
    expect(mode).toContain('flex: 0 0 auto');
    // 对照组：主文字色规则仍在（解释为什么必须复合选择器）。
    // 用选择器分组 helper 精确比对（不依赖 span/label 的书写顺序或格式）。
    const primaryGroups = selectorGroupsWith(
      settingsCss,
      'color: var(--adl-row-label-color, var(--text-primary))',
    );
    expect(
      primaryGroups.some((group) =>
        groupHasSelector(group, '.adl-settings-row__label > .adl-settings-row__label-text span'),
      ),
    ).toBe(true);
  });
});
