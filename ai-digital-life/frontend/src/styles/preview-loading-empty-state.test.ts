// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { findRuleGroups } from './testing/cssRules';

const previewCss = readFileSync(
  new URL('./regions/rightpanel/markdown-preview.css', import.meta.url),
  'utf-8',
);
const treeCss = readFileSync(
  new URL('./regions/rightpanel/tree-shared.css', import.meta.url),
  'utf-8',
);
const loadingRowCss = readFileSync(
  new URL('./components/loading-row.css', import.meta.url),
  'utf-8',
);
const skeletonCss = readFileSync(new URL('./components/skeleton.css', import.meta.url), 'utf-8');

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('docx 预览常驻滚动条', () => {
  it('在 .adl-docx-scroll 上恢复 classic 滚动条（覆盖全局 thin/overlay）', () => {
    const groups = findRuleGroups(stripComments(previewCss), '.adl-docx-scroll');
    expect(groups.length).toBeGreaterThan(0);
    expect(
      groups.some(
        (body) => /scrollbar-width:\s*auto/.test(body) && /scrollbar-color:\s*auto/.test(body),
      ),
    ).toBe(true);
  });
});

describe('Markdown frontmatter 属性表', () => {
  it('键值两列共享网格：外层 grid + 行 display:contents（值列垂直左对齐）', () => {
    const css = stripComments(previewCss);
    const container = findRuleGroups(css, '.adl-md-frontmatter');
    expect(
      container.some(
        (body) => /display:\s*grid/.test(body) && /grid-template-columns:\s*max-content/.test(body),
      ),
    ).toBe(true);
    const row = findRuleGroups(css, '.adl-md-frontmatter__row');
    expect(row.some((body) => /display:\s*contents/.test(body))).toBe(true);
  });

  it('采用方案 2 的字号，且值与键同色（均为 secondary）', () => {
    const css = stripComments(previewCss);
    const key = findRuleGroups(css, '.adl-md-frontmatter dt');
    expect(
      key.some(
        (body) => /font-size:\s*12px/.test(body) && /color:\s*var\(--text-secondary\)/.test(body),
      ),
    ).toBe(true);
    const value = findRuleGroups(css, '.adl-md-frontmatter dd');
    expect(
      value.some(
        (body) => /font-size:\s*14px/.test(body) && /color:\s*var\(--text-secondary\)/.test(body),
      ),
    ).toBe(true);
  });

  it('属性区与正文之间不用分隔线（仅间距）', () => {
    const css = stripComments(previewCss);
    const container = findRuleGroups(css, '.adl-md-frontmatter').filter((body) =>
      /grid-template-columns/.test(body),
    );
    expect(container.length).toBeGreaterThan(0);
    expect(container.every((body) => !/border-bottom/.test(body))).toBe(true);
    expect(container.some((body) => /margin:\s*0 0 1\.75em/.test(body))).toBe(true);
  });
});

describe('PDF 导航按钮', () => {
  it('上一页/下一页按钮悬停底色为圆形（radius-full）', () => {
    const groups = findRuleGroups(stripComments(previewCss), '.adl-pdf-preview-nav__step');
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.some((body) => /border-radius:\s*var\(--radius-full/.test(body))).toBe(true);
  });
});

describe('内容区加载占位', () => {
  it('office 预览用 overlay 占位铺满内容区（不被内层滚动容器内距裁掉）', () => {
    const groups = findRuleGroups(stripComments(previewCss), '.adl-preview-loading--overlay');
    expect(groups.length).toBeGreaterThan(0);
    expect(
      groups.some((body) => /position:\s*absolute/.test(body) && /inset:\s*0/.test(body)),
    ).toBe(true);
  });

  it('复用全局 .skeleton 扫光，不再声明文字加载态样式', () => {
    expect(stripComments(skeletonCss)).toContain('@keyframes skeleton-shimmer');
    const css = stripComments(previewCss);
    expect(css).toContain('.adl-preview-loading');
    expect(css).not.toContain('.adl-docx-preview-loading');
    expect(css).not.toContain('.adl-pdf-preview-loading');
  });
});

describe('空态文字统一规范', () => {
  it('.adl-empty-hint 不再限定 p 标签（浏览器树用 span）', () => {
    const css = stripComments(treeCss);
    expect(css).toMatch(/(^|\n)\.adl-empty-hint\s*\{/);
    expect(css).not.toMatch(/(^|\n)\s*p\.adl-empty-hint\s*\{/);
    const groups = findRuleGroups(css, '.adl-empty-hint');
    expect(
      groups.some(
        (body) =>
          /font-size:\s*var\(--text-xs\)/.test(body) && /color:\s*var\(--text-muted\)/.test(body),
      ),
    ).toBe(true);
  });

  it('EmptyRow 与基线同字号/行高/颜色', () => {
    const groups = findRuleGroups(stripComments(loadingRowCss), '.adl-empty-row');
    expect(groups.length).toBeGreaterThan(0);
    expect(
      groups.some(
        (body) =>
          /font-size:\s*var\(--text-xs\)/.test(body) &&
          /line-height:\s*1\.5/.test(body) &&
          /color:\s*var\(--text-muted\)/.test(body),
      ),
    ).toBe(true);
  });
});
