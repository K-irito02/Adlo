// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { exactRuleBody } from './testing/cssRules';

const fileOperationsCss = readFileSync(
  new URL('./regions/rightpanel/file-operations.css', import.meta.url),
  'utf-8',
);
const fileTreeBrowserCss = readFileSync(
  new URL('./regions/rightpanel/file-tree-browser.css', import.meta.url),
  'utf-8',
);

describe.each([
  ['file-operations.css', fileOperationsCss],
  ['file-tree-browser.css', fileTreeBrowserCss],
])('%s 的工作区菜单禁用态', (_name, css) => {
  it('禁用项与目录/文件菜单一致：变暗、默认光标、不接收指针事件', () => {
    const body = exactRuleBody(css, '.adl-multitree-entry__menu-item:disabled');
    expect(body).not.toBeNull();
    expect(body).toMatch(/opacity:\s*0\.4/);
    expect(body).toMatch(/cursor:\s*default/);
    expect(body).toMatch(/pointer-events:\s*none/);
  });

  it('hover 只作用于非禁用项', () => {
    expect(
      exactRuleBody(css, '.adl-multitree-entry__menu-item:hover:not(:disabled)'),
    ).not.toBeNull();
    // 未加守卫的裸 hover 不得残留：禁用项悬停时不能出现灰底。
    expect(exactRuleBody(css, '.adl-multitree-entry__menu-item:hover')).toBeNull();
  });
});
