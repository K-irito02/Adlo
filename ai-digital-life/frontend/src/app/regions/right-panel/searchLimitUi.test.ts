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
    for (const key of [
      'searchResultsShown',
      'searchAllShown',
      'searchLoadMore',
      'searchShowAll',
      'searchLimitHelpAria',
      'searchLimitHelpTitle',
      'searchLimitHelpWhyTitle',
      'searchLimitHelpWhy',
      'searchLimitHelpActionsTitle',
      'searchLimitHelpActions',
      'searchLimitHelpCeilingTitle',
      'searchLimitHelpCeiling',
      'searchLimitHelpScopeTitle',
      'searchLimitHelpScope',
    ]) {
      expect(zhCopy).toContain(`${key}:`);
      expect(enCopy).toContain(`${key}:`);
      // 插值文案走 formatT(t, 'key', …)，其余走 t.key —— 两种写法都要算已接线
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
});
