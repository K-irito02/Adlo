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
const searchPanelCss = readFileSync(
  new URL('./regions/rightpanel/search-panel.css', import.meta.url),
  'utf-8',
);
const searchSettingsCss = readFileSync(
  new URL('./regions/rightpanel/search-settings.css', import.meta.url),
  'utf-8',
);
const composerCss = readFileSync(
  new URL('./regions/composer-popover.css', import.meta.url),
  'utf-8',
);
const settingsCss = readFileSync(new URL('./components/settings.css', import.meta.url), 'utf-8');
const browserTreeCss = readFileSync(
  new URL('./regions/rightpanel/browser-tree-entry.css', import.meta.url),
  'utf-8',
);

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
        (body) =>
          /display:\s*grid/.test(body) &&
          /grid-template-columns:\s*minmax\(0,\s*max-content\)/.test(body),
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

  it('胶囊常驻 DOM、悬浮/焦点/编辑态显现，隐藏时不拦截指针', () => {
    const css = stripComments(previewCss);
    const nav = findRuleGroups(css, '.adl-pdf-preview-nav').filter((body) =>
      /position:\s*absolute/.test(body),
    );
    expect(nav.length).toBeGreaterThan(0);
    expect(
      nav.some((body) => /left:\s*50%/.test(body) && /transform:\s*translateX\(-50%\)/.test(body)),
    ).toBe(true);
    expect(
      nav.some((body) => /opacity:\s*0/.test(body) && /pointer-events:\s*none/.test(body)),
    ).toBe(true);

    // 显现契约：hover / focus-within / data-editing 三路都要有
    expect(css).toMatch(/\.adl-pdf-preview:hover \.adl-pdf-preview-nav[\s\S]*?opacity:\s*1/);
    expect(css).toMatch(/\.adl-pdf-preview-nav:focus-within[\s\S]*?opacity:\s*1/);
    expect(css).toMatch(/\.adl-pdf-preview-nav\[data-editing='true'\][\s\S]*?opacity:\s*1/);
    // 无悬停设备（触屏）常驻
    expect(css).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.adl-pdf-preview-nav[\s\S]*?opacity:\s*1/,
    );
  });

  it('导航层级高于加载遮罩（加载尾巴期仍可翻页）', () => {
    const css = stripComments(previewCss);
    const overlay = findRuleGroups(css, '.adl-preview-loading--overlay');
    const nav = findRuleGroups(css, '.adl-pdf-preview-nav').filter((body) =>
      /position:\s*absolute/.test(body),
    );
    const z = (groups: string[]) => {
      const match = groups.map((body) => /z-index:\s*(\d+)/.exec(body)).find(Boolean);
      return match ? Number(match[1]) : Number.NaN;
    };
    expect(z(overlay)).toBeGreaterThan(0);
    expect(z(nav)).toBeGreaterThan(z(overlay));
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

  it('基线的四项属性都被锁定（含行高与居中）', () => {
    const groups = findRuleGroups(stripComments(treeCss), '.adl-empty-hint');
    expect(
      groups.some(
        (body) =>
          /font-size:\s*var\(--text-xs\)/.test(body) &&
          /color:\s*var\(--text-muted\)/.test(body) &&
          /line-height:\s*1\.5/.test(body) &&
          /text-align:\s*center/.test(body),
      ),
    ).toBe(true);
  });

  it('面板规则只覆盖布局，字号/颜色/行高/居中只在基线', () => {
    for (const css of [searchPanelCss, searchSettingsCss, settingsCss]) {
      const rules = findRuleGroups(stripComments(css), '.adl-empty-hint');
      for (const body of rules) {
        expect(body).not.toMatch(/font-size|line-height|text-align|color:/);
      }
    }
    // 确认读到了真实规则（避免空断言通过）；search-panel 已无覆盖，允许为 0。
    expect(
      findRuleGroups(stripComments(searchSettingsCss), '.adl-empty-hint').length,
    ).toBeGreaterThan(0);
    expect(findRuleGroups(stripComments(settingsCss), '.adl-empty-hint').length).toBeGreaterThan(0);
  });

  it('浏览器树空态内距左右对称（文本水平居中）', () => {
    const groups = findRuleGroups(stripComments(browserTreeCss), '.adl-browser-entry__empty');
    expect(groups.length).toBeGreaterThan(0);
    const padding = groups.map((body) => /padding:\s*([^;]+);/.exec(body)?.[1]).find(Boolean);
    expect(padding).toBeTruthy();
    const tokens = (padding as string).trim().split(/\s+/);
    // 两值 shorthand：上下 / 左右 → 左右天然相等；四值要求左右相等。
    if (tokens.length === 4) {
      expect(tokens[1]).toBe(tokens[3]);
    } else {
      expect(tokens.length).toBe(2);
    }
  });

  it('EmptyRow 文本居中由自身规则保证', () => {
    const groups = findRuleGroups(stripComments(loadingRowCss), '.adl-empty-row__text');
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.some((body) => /text-align:\s*center/.test(body))).toBe(true);
  });

  it('书签空态使用同一规范', () => {
    const bookmark = findRuleGroups(stripComments(composerCss), '.adl-bookmark-dir-empty');
    expect(
      bookmark.some(
        (body) =>
          /font-size:\s*var\(--text-xs\)/.test(body) &&
          /line-height:\s*1\.5/.test(body) &&
          /text-align:\s*center/.test(body),
      ),
    ).toBe(true);
  });

  it('后迁移的两个实时空态也保持四项规范', () => {
    const allowlist = findRuleGroups(stripComments(settingsCss), '.adl-settings-allowlist__empty');
    expect(
      allowlist.some(
        (body) =>
          /font-size:\s*var\(--text-xs\)/.test(body) &&
          /line-height:\s*1\.5/.test(body) &&
          /color:\s*var\(--text-muted\)/.test(body) &&
          /text-align:\s*center/.test(body),
      ),
    ).toBe(true);
    const xlsxEmpty = findRuleGroups(stripComments(previewCss), '.adl-xlsx-preview__empty');
    expect(
      xlsxEmpty.some(
        (body) =>
          /font-size:\s*var\(--text-xs\)/.test(body) &&
          /line-height:\s*1\.5/.test(body) &&
          /color:\s*var\(--text-muted\)/.test(body) &&
          /text-align:\s*center/.test(body),
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
