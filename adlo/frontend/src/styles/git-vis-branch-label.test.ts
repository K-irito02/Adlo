// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exactRuleBody } from './testing/cssRules';

/**
 * 分支图谱标签文字的行盒契约。
 *
 * 标签按钮（`BranchGraph.tsx`）为紧凑胶囊设了 `line-height: 1`；该值会继承到
 * `.adl-branch-graph__label-text`。文字 span 又用 `overflow: hidden` 做单行省略，
 * 于是 1em（11px）的行盒比字体 ascent+descent（实测 12px）矮 1px，把 "g" 的下伸部
 * 裁掉，显示成 "q"。真实浏览器实测：before clientHeight=11 / glyphBottom=11.5（裁切），
 * after（line-height: normal）clientHeight=12 / glyphBottom=12（完整）。
 *
 * 删除性推演：删掉下面这条 `line-height: normal`，本用例变红。
 */
const css = readFileSync(
  new URL('./regions/rightpanel/git-visualization.css', import.meta.url),
  'utf-8',
);

describe('分支图谱标签文字行盒', () => {
  it('省略号 span 用字体自带行盒，避免下伸字母被 overflow 裁切', () => {
    const body = exactRuleBody(css, '.adl-branch-graph__label-text');
    expect(body).not.toBeNull();
    // 单行省略仍需水平裁切 + 省略号
    expect(body).toContain('overflow: hidden');
    expect(body).toContain('text-overflow: ellipsis');
    // 行盒必须覆盖字体 ascent+descent，不能沿用按钮的 line-height: 1
    expect(body).toContain('line-height: normal');
  });
});
