// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 检索结果窗口的 UI 契约（事项 5）：
 * 提示行必须同时提供「加载更多」「显示全部」与「!」详细说明入口，
 * 且文案全部走 i18n（不允许硬编码），上限常量只来自前端单一来源。
 */
const fileNavigatorShellSource = readFileSync(
  new URL('./FileNavigatorShell.tsx', import.meta.url),
  'utf8',
);
const helpCardSource = readFileSync(new URL('./SearchLimitHelpCard.tsx', import.meta.url), 'utf8');
const searchActionsSource = readFileSync(
  new URL('../../stores/actions/searchActions.ts', import.meta.url),
  'utf8',
);
const searchPanelCss = readFileSync(
  new URL('../../../../src/styles/regions/rightpanel/search-panel.css', import.meta.url),
  'utf8',
);
const iconButtonCss = readFileSync(
  new URL('../../../../src/styles/components/icon-button.css', import.meta.url),
  'utf8',
);
const componentsCss = readFileSync(
  new URL('../../../../src/styles/components.css', import.meta.url),
  'utf8',
);
const zhCopy = readFileSync(new URL('../../i18n/zh-CN/file.ts', import.meta.url), 'utf8');
const enCopy = readFileSync(new URL('../../i18n/en-US/file.ts', import.meta.url), 'utf8');

/**
 * `formatT(t, '<key>', <第三参数>)` 的容忍匹配：空白、变量名、对象字面量都不敏感，
 * 只锁定"该键确实被 formatT 调用且传了插值变量" —— 精确字面串会因 prettier 换行
 * 或重命名而假失败。
 */
function interpolatedCallPattern(key: string): RegExp {
  return new RegExp(`formatT\\(\\s*t\\s*,\\s*'${key}'\\s*,\\s*[^)]+\\s*\\)`);
}

describe('search result window UI (事项 5)', () => {
  it('offers both paging actions plus the help trigger in the limit row', () => {
    expect(fileNavigatorShellSource).toContain('adl-search-limit');
    expect(fileNavigatorShellSource).toContain('loadMoreSearchResults');
    expect(fileNavigatorShellSource).toContain('showAllSearchResults');
    expect(fileNavigatorShellSource).toContain('HintCardTrigger');
    expect(fileNavigatorShellSource).toContain('SearchLimitHelpCard');
    expect(fileNavigatorShellSource).toContain('IconCircleHelp');
    // 精确 hasMore 取代了旧的保守推断
    expect(fileNavigatorShellSource).not.toContain('searchPartial');
  });

  it('disables both actions while a search is running', () => {
    expect(fileNavigatorShellSource).toContain('disabled={searching}');
  });

  it('keeps every label in i18n (zh + en parity)', () => {
    // 含数量插值的键必须经 formatT 显式传入变量，否则用户会直接看到
    // `{page}` / `{max}` / `{count}` 字面量；用容忍正则断言，避免换行/改名造成假失败。
    const interpolated: { key: string; source: string }[] = [
      { key: 'searchResultsShown', source: fileNavigatorShellSource },
      { key: 'searchAllShown', source: fileNavigatorShellSource },
      { key: 'searchLimitHelpWhy', source: helpCardSource },
      { key: 'searchLimitHelpActions', source: helpCardSource },
      { key: 'searchLimitHelpCeiling', source: helpCardSource },
    ];
    const plain = [
      'searchLoadMore',
      'searchShowAll',
      'searchLimitHelpAria',
      'searchLimitHelpTitle',
      'searchLimitHelpWhyTitle',
      'searchLimitHelpActionsTitle',
      'searchLimitHelpCeilingTitle',
      'searchLimitHelpScopeTitle',
      'searchLimitHelpScope',
    ];

    for (const key of [...plain, ...interpolated.map((entry) => entry.key)]) {
      expect(zhCopy).toContain(`${key}:`);
      expect(enCopy).toContain(`${key}:`);
    }

    for (const { key, source } of interpolated) {
      expect(interpolatedCallPattern(key).test(source), `${key} 未通过 formatT 传入插值变量`).toBe(
        true,
      );
    }

    for (const key of plain) {
      // 其余文案走 t.key 或键名字面量（两种写法都算已接线）
      const wired =
        fileNavigatorShellSource.includes(`t.${key}`) ||
        fileNavigatorShellSource.includes(`'${key}'`) ||
        helpCardSource.includes(`t.${key}`) ||
        helpCardSource.includes(`'${key}'`);
      expect(wired, `${key} 未在 UI 中被引用`).toBe(true);
    }
  });

  it('reuses the shared help card layout and card chrome', () => {
    expect(helpCardSource).toContain('adl-help-card');
    expect(helpCardSource).toContain('adl-help-card__section-body');
  });

  it('takes the window constants from the single frontend source', () => {
    expect(searchActionsSource).toContain('SEARCH_PAGE_SIZE');
    expect(searchActionsSource).toContain('SEARCH_MAX_RESULTS');
    expect(searchActionsSource).not.toContain('MAX_HITS');
  });

  it('styles the limit row and the shared icon button', () => {
    expect(searchPanelCss).toContain('.adl-search-limit__action');
    expect(searchPanelCss).toContain('.adl-search-limit__help');
    expect(iconButtonCss).toContain('.adl-icon-button {');
    expect(iconButtonCss).toContain('.adl-icon-button--info');
    // 共享样式必须在组件聚合入口登记，否则不生效
    expect(componentsCss).toContain('components/icon-button.css');
  });

  it('keeps the limit row on one line with an overlay loading state and borderless actions', () => {
    // 悬浮加载：结果区容器为定位锚点，加载块脱离文档流覆盖其上
    expect(fileNavigatorShellSource).toContain('adl-search-results-wrap');
    expect(fileNavigatorShellSource).toContain('adl-search-loading--overlay');
    expect(searchPanelCss).toContain('.adl-search-results-wrap');
    expect(searchPanelCss).toContain('.adl-search-loading--overlay');
    expect(searchPanelCss).toContain('position: absolute');
    // 分页行单行：nowrap + 文本省略 + 按钮组右贴边容器
    expect(fileNavigatorShellSource).toContain('adl-search-limit__actions');
    expect(searchPanelCss).toContain('.adl-search-limit__actions');
    expect(searchPanelCss).toContain('flex-wrap: nowrap');
    expect(searchPanelCss).toContain('text-overflow: ellipsis');
    // 去边框文字按钮：无边框、常驻主题高亮、悬停灰底、按钮文本不换行、键盘焦点可见
    expect(searchPanelCss).toContain('.adl-search-limit__action:focus-visible');
    expect(searchPanelCss).toContain('white-space: nowrap');
    expect(searchPanelCss).not.toContain('border-color: var(--accent');
  });
});
