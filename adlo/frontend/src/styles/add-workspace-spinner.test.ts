// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findRuleGroups } from './testing/cssRules';

/**
 * 「添加工作区」加载圈颜色契约：蓝紫色 token 仅在标题栏动作组内生效，
 * 不影响其它 Spinner 调用处（它们仍用 `--text-secondary`）。
 */
function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf-8');
}

function bodies(css: string, selector: string): string {
  return findRuleGroups(css, selector)
    .map((block) => block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')))
    .join('\n');
}

describe('添加工作区加载圈颜色', () => {
  const titlebarCss = readRepoFile('./regions/titlebar.css');

  it('标题栏动作组的 Spinner 使用蓝紫色 token', () => {
    const body = bodies(titlebarCss, '.adl-titlebar__action-group .adl-spinner');
    expect(body).toContain('color: var(--accent-violet)');
  });

  it('加载按钮虽 disabled 但不被压暗（0.4 透明度会让颜色变暗淡）', () => {
    const body = bodies(
      titlebarCss,
      '.adl-titlebar__action-group .adl-icon-btn.is-loading:disabled',
    );
    expect(body).toContain('opacity: 1');
  });

  it('亮色与暗色主题都定义了 --accent-violet', () => {
    const themes = readRepoFile('./themes.css');
    const matches = themes.match(/--accent-violet:\s*#[0-9a-fA-F]{6}/g) ?? [];
    expect(matches).toHaveLength(2);
  });
});
