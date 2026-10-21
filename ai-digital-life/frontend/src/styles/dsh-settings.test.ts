// @vitest-environment node
// 本文件 ruleBody 只支持单选择器精确匹配（无分组/嵌套处理）；被测 DSH 规则均为
// 单选择器，如需断言共享分组选择器请用 workspace-settings.test.ts 的 groupRuleBody。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const dshCss = readFileSync(new URL('./regions/dsh-version.css', import.meta.url), 'utf-8');
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
    const token = ruleBody(dshCss, '.adl-dsh-settings');
    expect(token).not.toBeNull();
    expect(token).toContain('--dsh-note-fg: #80b0f5');
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
