// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileZh } from '../../i18n/zh-CN/file';
import { fileEn } from '../../i18n/en-US/file';

// 检索文件模式（事项 1-6）：源码接线断言。新增 UI 文案必须走 i18n key（禁硬编码），
// 检索视图/范围必须持久化，检索结果区必须使用文件树同款 CustomScrollArea。
describe('files search mode wiring', () => {
  const shellSource = readFileSync(new URL('./FileNavigatorShell.tsx', import.meta.url), 'utf8');
  const toolbarSource = readFileSync(
    new URL('./FileNavigatorToolbar.tsx', import.meta.url),
    'utf8',
  );
  const filesPanelSource = readFileSync(
    new URL('./panels/FilesPanel.tsx', import.meta.url),
    'utf8',
  );
  const uiSliceSource = readFileSync(
    new URL('../../stores/slices/uiSlice.ts', import.meta.url),
    'utf8',
  );
  const uiSliceTypesSource = readFileSync(
    new URL('../../stores/slices/uiSliceTypes.ts', import.meta.url),
    'utf8',
  );
  const searchActionsSource = readFileSync(
    new URL('../../stores/actions/searchActions.ts', import.meta.url),
    'utf8',
  );
  const resultsTreeSource = readFileSync(
    new URL('./SearchResultsTree.tsx', import.meta.url),
    'utf8',
  );
  const highlightSource = readFileSync(new URL('./searchHighlight.tsx', import.meta.url), 'utf8');
  const searchPanelCss = readFileSync(
    new URL('../../../styles/regions/rightpanel/search-panel.css', import.meta.url),
    'utf8',
  );
  const fileIconsSource = readFileSync(new URL('../../icons/file.tsx', import.meta.url), 'utf8');
  const fileIconsIndexSource = readFileSync(
    new URL('../../icons/index.ts', import.meta.url),
    'utf8',
  );
  const revealSource = readFileSync(
    new URL('../../hooks/useEditorReveal.ts', import.meta.url),
    'utf8',
  );
  const searchSliceSource = readFileSync(
    new URL('../../stores/slices/searchSlice.ts', import.meta.url),
    'utf8',
  );
  const searchPanelHookSource = readFileSync(
    new URL('./hooks/useSearchPanel.ts', import.meta.url),
    'utf8',
  );
  const startupSource = readFileSync(
    new URL('../../hooks/useAppStartup.ts', import.meta.url),
    'utf8',
  );

  it('has i18n keys for search scope/view/loading/empty states (zh + en)', () => {
    for (const dict of [fileZh, fileEn]) {
      expect(dict.searchScopeFile).toBeTruthy();
      expect(dict.searchScopeContent).toBeTruthy();
      expect(dict.searchScopeLabel).toBeTruthy();
      expect(dict.searchListView).toBeTruthy();
      expect(dict.searchSearching).toBeTruthy();
      expect(dict.searchNoWorkspace).toBeTruthy();
    }
    expect(fileZh.searchSearching).toContain('检索中');
  });

  it('wraps the replace toggle in a tooltip (事项 1)', () => {
    expect(shellSource).toContain('searchPanelToggleReplace');
    // 替换开关按钮必须被 TooltipSimple 包裹（与 Aa/ab/.* 及替换执行按钮一致）
    const toggleIdx = shellSource.indexOf('adl-search-panel__toggle');
    const tooltipBefore = shellSource.lastIndexOf('TooltipSimple', toggleIdx);
    expect(tooltipBefore).toBeGreaterThan(-1);
    expect(shellSource).toContain('<TooltipSimple content={t.searchPanelToggleReplace}');
  });

  it('keeps search mode when switching views; only the back button exits (事项 2)', () => {
    // 工具栏检索模式下三视图按钮只切换 searchView，不调用 onSetNavigatorMode
    expect(toolbarSource).toContain("onSetSearchView('tree')");
    expect(toolbarSource).toContain("onSetSearchView('list')");
    expect(toolbarSource).toContain("onSetSearchView('outline')");
    expect(toolbarSource).toContain('isSearchMode');
    // 回退按钮仍是唯一出入口（FilesPanel 顶栏 search <-> tree 切换保留）
    expect(filesPanelSource).toContain(
      "setNavigatorMode(navigatorMode === 'search' ? 'tree' : 'search')",
    );
  });

  it('hides create actions and shows file/content segmented control in search mode (事项 2)', () => {
    // 检索模式下不渲染新建文件/文件夹按钮（分段控制器占据原新建按钮位置）
    expect(toolbarSource).toContain('isSearchMode ? (');
    expect(toolbarSource).toContain('onSetSearchScope');
    // 工具栏第二行分段控制器复用变更面板内联/并排样式类
    expect(toolbarSource).toContain('adl-tool-context__diff-view');
    expect(toolbarSource).toContain('t.searchScopeFile');
    expect(toolbarSource).toContain('t.searchScopeContent');
    // 顶栏不再承载分段控制器
    expect(filesPanelSource).not.toContain('setFilesSearchScope');
  });

  it('renders search results with the file-tree custom scrollbar (事项 3)', () => {
    expect(resultsTreeSource).toContain('shellClassName="adl-multitree"');
    expect(resultsTreeSource).toContain('scrollbarClassName="adl-multitree-scrollbar"');
  });

  it('tracks searching state and shows loading animation with text (事项 4)', () => {
    expect(searchSliceSource).toContain('searching');
    expect(searchActionsSource).toContain('searching: true');
    expect(searchActionsSource).toContain('searching: false');
    expect(shellSource).toContain('t.searchSearching');
    expect(shellSource).toContain('<Spinner');
  });

  it('handles no-workspace empty state and shows search scope name (事项 5)', () => {
    expect(shellSource).toContain('t.searchNoWorkspace');
    expect(shellSource).toContain('searchScopeWorkspaceName');
    expect(shellSource).toContain('visibleWorkspaces.length === 0');
  });

  it('reuses the changes-panel row chrome for search results (事项 7)', () => {
    // 与变更面板共用同一行级结构：TreeNodeRow + adl-filetree__* + FileIcon + 分组头
    expect(resultsTreeSource).toContain('TreeNodeRow');
    expect(resultsTreeSource).toContain('adl-filetree__item');
    expect(resultsTreeSource).toContain('adl-filetree__row');
    expect(resultsTreeSource).toContain('adl-filetree__label');
    expect(resultsTreeSource).toContain('adl-filetree__toggle');
    expect(resultsTreeSource).toContain('adl-filetree__count');
    expect(resultsTreeSource).toContain('FileIcon');
    expect(resultsTreeSource).toContain('adl-multitree-entry__header');
    // 内容范围文件行下方追加内容片段子行
    expect(resultsTreeSource).toContain('adl-search-snippet-list');
    // Shell 通过新组件渲染两种范围
    expect(shellSource).toContain('<SearchResultsTree');
    expect(shellSource).toContain("variant={filesSearchView === 'tree' ? 'tree' : 'list'}");
  });

  it('highlights matches with the project warning yellow (事项 8)', () => {
    expect(highlightSource).toContain('highlightMatch');
    expect(highlightSource).toContain('<mark');
    expect(highlightSource).toContain('adl-search-highlight');
    expect(resultsTreeSource).toContain('highlightMatch');
  });

  it('shows "检索 xxx" inside the search input, scope line removed (事项 10)', () => {
    expect(fileZh.searchInputPlaceholder).toContain('检索');
    expect(fileZh.searchInputPlaceholder).toContain('{name}');
    expect(fileEn.searchInputPlaceholder).toBeTruthy();
    expect(shellSource).toContain("formatT(t, 'searchInputPlaceholder'");
    expect(shellSource).toContain('searchInputPlaceholder');
    expect(shellSource).not.toContain('adl-search-panel__scope');
  });

  it('centers a vertical loading indicator in the results area (事项 11)', () => {
    expect(shellSource).toContain('adl-search-loading');
    expect(searchPanelCss).toContain('flex-direction: column');
    expect(searchPanelCss).toContain('.adl-search-loading');
  });

  it('left-aligns snippets to the results edge (事项 12, 事项 20/23/27/29/31 更新为行号首位对齐文件名首位)', () => {
    expect(searchPanelCss).toContain(
      'calc(var(--adl-search-pull, 4px) + var(--adl-tree-indent, 0px) + 34px)',
    );
    expect(resultsTreeSource).toContain('--adl-search-pull');
    expect(searchPanelCss).toContain('text-align: left;');
  });

  it('flushes row hover backgrounds to the results edges (事项 13)', () => {
    expect(resultsTreeSource).toContain('adl-filetree adl-tree-root adl-search-results');
    expect(searchPanelCss).toContain('.adl-search-snippet__btn');
    // 片段按钮无圆角、无右侧内边距，悬停背景贴合边缘
    expect(searchPanelCss).toContain('border-radius: 0');
  });

  it('propagates row hover highlight to folder toggles (事项 14)', () => {
    expect(searchPanelCss).toContain(
      '.adl-search-results .adl-filetree__row:hover .adl-filetree__toggle',
    );
    expect(searchPanelCss).toContain(
      '.adl-search-results .adl-multitree-entry__header:hover .adl-multitree-entry__expand-btn',
    );
  });

  it('swaps file count for snippet fold toggle on hover (事项 16)', () => {
    expect(fileIconsSource).toContain('IconSnippetCollapse');
    expect(fileIconsSource).toContain('IconSnippetExpand');
    expect(fileIconsIndexSource).toContain('IconSnippetCollapse');
    expect(resultsTreeSource).toContain('IconSnippetCollapse');
    expect(resultsTreeSource).toContain('IconSnippetExpand');
    expect(resultsTreeSource).toContain('adl-search-file__snippet-toggle');
    expect(resultsTreeSource).toContain('adl-search-file__count');
    expect(searchPanelCss).toContain(
      '.adl-search-results .adl-filetree__row:hover .adl-search-file__count',
    );
  });

  it('persists search view and scope in localStorage (事项 6)', () => {
    expect(uiSliceTypesSource).toContain('FILES_SEARCH_VIEW_KEY');
    expect(uiSliceTypesSource).toContain('FILES_SEARCH_SCOPE_KEY');
    expect(uiSliceSource).toContain('readFilesSearchView');
    expect(uiSliceSource).toContain('writeFilesSearchScope');
    expect(uiSliceSource).toContain('setFilesSearchView');
    expect(uiSliceSource).toContain('setFilesSearchScope');
  });

  it('drives results by committed query, not draft input (事项 17)', () => {
    expect(shellSource).toContain('committedSearchQuery');
    expect(shellSource).toContain('searchQuery: committedSearchQuery');
    expect(shellSource).toContain('!committedSearchQuery.trim()');
    expect(shellSource).toContain('query={committedSearchQuery}');
  });

  it('propagates toggle highlight to descendant toggles only (事项 18, 事项 25 收敛)', () => {
    expect(searchPanelCss).toContain(
      '.adl-search-results .adl-filetree__row:hover ~ .adl-filetree__children .adl-filetree__toggle',
    );
    expect(searchPanelCss).not.toContain(
      '.adl-search-results .adl-filetree__item:hover .adl-filetree__toggle',
    );
  });

  it('removes horizontal panel padding for flush hover edges (事项 19)', () => {
    expect(searchPanelCss).toContain('padding: 2px 0;');
  });

  it('aligns snippet line numbers with file names (事项 20, 事项 23/27/29/31 修正)', () => {
    expect(searchPanelCss).toContain(
      'calc(var(--adl-search-pull, 4px) + var(--adl-tree-indent, 0px) + 34px)',
    );
  });

  it('centers the snippet fold toggle vertically (事项 21)', () => {
    expect(searchPanelCss).toContain('.adl-search-results .adl-filetree__meta');
    expect(searchPanelCss).toContain('align-self: center');
  });

  it('titles snippets as line plus full preview (事项 22)', () => {
    expect(resultsTreeSource).toContain('title={`${snippet.line} ${snippet.preview}`}');
  });

  it('uses the FileTree depth convention for both file and directory rows (事项 31)', () => {
    // FileTree 传 flatDepth+1；目录行与文件行内部都必须 +1（否则同为一级时缩进差 14px）
    const plusOne = resultsTreeSource.split('depth={depth + 1}').length - 1;
    expect(plusOne).toBeGreaterThanOrEqual(2);
  });

  it('aligns snippets with file names via pull plus indent (事项 23)', () => {
    expect(searchPanelCss).toContain('var(--adl-search-pull');
  });

  it('bleeds snippet hover backgrounds edge to edge (事项 24)', () => {
    expect(searchPanelCss).toContain('margin-inline-start: calc(-1 * var(--adl-search-pull, 4px))');
  });

  it('toggles all snippets or dirs from the toolbar button in search mode (事项 33)', () => {
    expect(shellSource).toContain('searchStructureSignal');
    expect(shellSource).toContain("target: 'snippets'");
    expect(shellSource).toContain("target: 'dirs'");
    expect(shellSource).toContain('onCollapseStatusChange');
    expect(shellSource).toContain('snippetsAllCollapsed');
    expect(resultsTreeSource).toContain('SearchStructureSignal');
    expect(resultsTreeSource).toContain('snippetsAllCollapsed');
    expect(resultsTreeSource).toContain('dirsAllCollapsed');
  });

  it('highlights file names only in file scope (事项 34)', () => {
    expect(shellSource).toContain(
      "nameQuery={filesSearchScope === 'file' ? committedSearchQuery : ''}",
    );
    expect(resultsTreeSource).toContain('nameQuery');
  });

  it('matches file scope by file name only (事项 35)', () => {
    expect(shellSource).toContain('hayName.includes(needle)');
    expect(shellSource).not.toContain('hayPath');
  });

  it('clears stale results when a new search starts (事项 36)', () => {
    expect(searchActionsSource).toContain('beginSearchSession');
  });

  it('enables the structure toggle in search outline view like normal outline (事项 37)', () => {
    expect(shellSource).toContain('inOutlineView');
    expect(shellSource).toContain("inSearchMode && filesSearchView === 'outline'");
  });

  it('skips the backend request in file scope (事项 38)', () => {
    expect(searchActionsSource).toContain("state.filesSearchScope === 'file'");
  });

  it('jumps to the snippet line in preview mode too (事项 39)', () => {
    expect(filesPanelSource).toContain('handleOpenSearchResultAtLine');
    expect(filesPanelSource).toContain('pendingPreviewRevealRef');
    expect(filesPanelSource).toContain('onOpenFileAtLine={handleOpenSearchResultAtLine}');
    // 旧内容基线：新内容到达前不用旧 DOM 跳转
    expect(filesPanelSource).toContain('baseline');
  });

  it('guards editor reveals against out-of-range lines by clamping (事项 40/44)', () => {
    expect(revealSource).toContain('revealLineSafely');
    expect(revealSource).toContain('getLineCount');
    expect(revealSource).toContain('stale reveal line clamped');
    expect(filesPanelSource).toContain('stale navigate line clamped');
  });

  it('retries preview reveal until lazy anchors mount (事项 43)', () => {
    expect(filesPanelSource).toContain('revealInPreview');
    expect(filesPanelSource).toContain('setInterval(attempt, 60)');
    // 重试上限 2.5s（事项 43）；临时调试日志已随事项 42 移除，不得回潮
    expect(filesPanelSource).toContain('2500');
    expect(filesPanelSource).not.toContain('preview-give-up');
    expect(filesPanelSource).not.toContain('ADL-DEBUG');
  });

  it('waits for a fresh editor model instead of dropping the reveal (事项 43)', () => {
    expect(revealSource).toContain('modelFresh');
    expect(revealSource).toContain('expectedLines');
    expect(revealSource).toContain('give up stale pending reveal');
  });

  it('does not run an editor reveal for preview-mode files (事项 44)', () => {
    // 预览模式只打开文件，行定位走 revealInPreview
    expect(filesPanelSource).toContain('onOpenFile(relativePath);');
  });

  it('passes filetree meta class so the fold toggle centers (事项 26)', () => {
    expect(resultsTreeSource).toContain(
      'metaClassName="adl-filetree__meta adl-tree-node__meta--inline"',
    );
  });

  it('extends static trunks flush to the subtree bottom (事项 15/28, 事项 32 改为结构性画法)', () => {
    // 线画在子级 ul（高度即整棵子树），上下各外扩 1px 桥接 ul gap
    expect(searchPanelCss).toContain('.adl-search-results .adl-filetree__children::before');
    expect(searchPanelCss).toContain('top: -1px;');
    expect(searchPanelCss).toContain('bottom: -1px;');
    // li 自身不画线，避免与 28px 回退值叠加
    expect(searchPanelCss).toContain('.adl-search-results .adl-filetree__item::before {');
    expect(searchPanelCss).toContain('display: none;');
  });

  it('validates and relocates the clicked hit, marking stale when gone (事项 45)', () => {
    expect(filesPanelSource).toContain('findLineForQuery');
    expect(filesPanelSource).toContain('markSearchHitStale');
    expect(filesPanelSource).toContain('revealSourceLine');
    expect(resultsTreeSource).toContain('searchHitStale');
  });

  it('sources the search options from the store so relocation matches the query (事项 45)', () => {
    expect(shellSource).toContain('searchUseRegex');
    expect(searchPanelHookSource).toContain('s.searchMatchCase');
  });

  it('subscribes to workspace file-change batches (事项 45)', () => {
    expect(startupSource).toContain('subscribeWorkspaceFilesChanged');
  });
});
