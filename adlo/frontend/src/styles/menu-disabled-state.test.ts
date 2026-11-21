// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const fileOperationsCss = readFileSync(
  new URL('./regions/rightpanel/file-operations.css', import.meta.url),
  'utf-8',
);
const fileTreeBrowserCss = readFileSync(
  new URL('./regions/rightpanel/file-tree-browser.css', import.meta.url),
  'utf-8',
);

/** 查找完整选择器规则（选择器行首/行尾、紧随 `{`），避免命中注释或前缀相同的类名。 */
function ruleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{`, 'm').exec(css);
  if (!match) {
    return null;
  }
  const open = css.indexOf('{', match.index);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe.each([
  ['file-operations.css', fileOperationsCss],
  ['file-tree-browser.css', fileTreeBrowserCss],
])('%s 的工作区菜单禁用态', (_name, css) => {
  it('禁用项有变暗/不可点击视觉', () => {
    const body = ruleBody(css, '.adl-multitree-entry__menu-item:disabled');
    expect(body).not.toBeNull();
    expect(body).toMatch(/opacity\s*:/);
    expect(body).toMatch(/cursor\s*:\s*not-allowed/);
  });

  it('hover 只作用于非禁用项', () => {
    expect(ruleBody(css, '.adl-multitree-entry__menu-item:hover:not(:disabled)')).not.toBeNull();
    // 未加守卫的裸 hover 不得残留：禁用项悬停时不能出现灰底。
    expect(ruleBody(css, '.adl-multitree-entry__menu-item:hover')).toBeNull();
  });
});
