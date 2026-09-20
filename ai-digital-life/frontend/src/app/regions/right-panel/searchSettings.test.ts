// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileZh } from '../../i18n/zh-CN/file';
import { fileEn } from '../../i18n/en-US/file';

/**
 * 检索设置弹窗的 UI 契约：
 * 工具栏标题为「检索」并带设置入口；弹窗含忽略/限制双 tab；
 * 忽略树复用文件树行级 chrome；文案全部走 i18n（不允许硬编码）。
 */
const toolbarSource = readFileSync(new URL('./FileNavigatorToolbar.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('./FileNavigatorShell.tsx', import.meta.url), 'utf8');
const dialogSource = readFileSync(new URL('./SearchSettingsDialog.tsx', import.meta.url), 'utf8');
const treeSource = readFileSync(new URL('./SearchIgnoreTree.tsx', import.meta.url), 'utf8');
const searchSliceSource = readFileSync(
  new URL('../../stores/slices/searchSlice.ts', import.meta.url),
  'utf8',
);
const searchActionsSource = readFileSync(
  new URL('../../stores/actions/searchActions.ts', import.meta.url),
  'utf8',
);

describe('search settings dialog wiring', () => {
  it('renames the search title and adds a settings entry next to it', () => {
    expect(toolbarSource).toContain('onOpenSearchSettings');
    expect(toolbarSource).toContain('t.searchSettings');
    expect(toolbarSource).toContain('IconSettings');
    // 齿轮图标比工具栏常规 14px 小一号，避免视觉过大。
    expect(toolbarSource).toContain('IconSettings size={12}');
    expect(shellSource).toContain('t.searchShort');
    expect(shellSource).toContain('SearchSettingsDialog');
  });

  it('offers ignore/limits tabs with hint triggers in both', () => {
    expect(dialogSource).toContain('searchSettingsIgnoreTab');
    expect(dialogSource).toContain('searchSettingsLimitsTab');
    expect(dialogSource).toContain('HintCardTrigger');
    // 标题右侧说明图标：内容为分节卡片（ignore/limits 各一张），行内旧纯文本说明已移除。
    expect(dialogSource).toContain('SearchIgnoreHelpCard');
    expect(dialogSource).toContain('SearchLimitsHelpCard');
    expect(dialogSource).not.toContain('searchSettingsIgnoreHint as string');
    expect(dialogSource).not.toContain('searchSettingsLimitsHint as string');
    expect(dialogSource).toContain('SearchIgnoreTree');
    expect(dialogSource).toContain('searchSettingsUseGitignore');
    expect(dialogSource).toContain('searchSettingsOverLimitWarn');
    // tab 导航与热力聚合图共用共享 UnderlineTabs；说明图标为 Git 图表同款虚线圆圈问号。
    expect(dialogSource).toContain('UnderlineTabs');
    expect(dialogSource).toContain('adl-underline-tabs__nav');
    expect(dialogSource).toContain('IconCircleHelp');
    expect(dialogSource).not.toContain('aria-hidden="true">!</span>');
    // 说明图标不再跟在开关旁（标题右侧已有）。
    expect(dialogSource).not.toContain('searchSettingsIgnoreHintTitle as string');
  });

  it('renders sectioned help cards on the shared help-card layout', () => {
    const ignoreCardSource = readFileSync(
      new URL('./SearchIgnoreHelpCard.tsx', import.meta.url),
      'utf8',
    );
    const limitsCardSource = readFileSync(
      new URL('./SearchLimitsHelpCard.tsx', import.meta.url),
      'utf8',
    );
    for (const source of [ignoreCardSource, limitsCardSource]) {
      expect(source).toContain('adl-help-card');
      expect(source).toContain('adl-help-card__section-title');
      expect(source).toContain('adl-help-card__section-body');
    }
    expect(limitsCardSource).toContain("formatT(t, 'searchLimitsHelpTooSmallBody'");
    expect(limitsCardSource).toContain("formatT(t, 'searchLimitsHelpTooBigBody'");
  });

  it('lays out expand-all and the gitignore switch on one row', () => {
    // 展开/折叠按钮在左、gitignore 开关在右：开关经 toolbarExtra 注入树工具栏右侧。
    expect(dialogSource).toContain('toolbarExtra');
    expect(treeSource).toContain('toolbarExtra');
    expect(treeSource).toContain('adl-search-ignore__toolbar-group');
  });

  it('uses self-contained rows with a leftmost checkbox column', () => {
    // 自定义行（不用 TreeNodeRow/adl-filetree__row：full-bleed 在弹窗边框容器里会溢出），
    // 第 1 列=勾选框（最左侧独立列），第 2 列=chevron，第 3 列=图标+名称。
    expect(treeSource).not.toContain('file-tree/TreeNodeRow');
    expect(treeSource).not.toContain('adl-filetree__row');
    expect(treeSource).toContain('adl-search-ignore__check');
    expect(treeSource).toContain('adl-search-ignore__row');
    expect(treeSource).toContain('FileIcon');
    expect(treeSource).toContain('IconChevronDown');
    expect(treeSource).toContain('CustomScrollArea');
    expect(treeSource).toContain('role="checkbox"');
    expect(treeSource).toContain('is-partial');
  });

  it('persists settings per workspace and passes the filter to the backend', () => {
    expect(searchSliceSource).toContain('searchIgnoredPaths');
    expect(searchSliceSource).toContain('searchUseGitignore');
    expect(searchSliceSource).toContain('searchPageSize');
    expect(searchSliceSource).toContain('searchMaxResults');
    expect(searchSliceSource).toContain('selectSearchFilter');
    expect(searchActionsSource).toContain('selectSearchFilter');
  });

  it('applies gitignore to file-name scope too (parity with content search)', () => {
    // 事项 M-2 功能补齐：文件名范围经桥读 `.gitignore` 内容后用共享 matcher 判定。
    expect(shellSource).toContain('createGitignoreMatcher');
    expect(shellSource).toContain('readFileForWorkspace');
    expect(shellSource).toContain('gitignoreMatchers');
  });

  it('saves via an explicit Save button with feedback and immediate effect', () => {
    // 草稿态 + 保存落盘：弹窗内修改只写草稿，点保存才写 store；
    // 保存后有 loading→打勾反馈，且有在途检索时立即重跑生效。
    expect(dialogSource).toContain('searchSettingsSave');
    expect(dialogSource).toContain('draftIgnored');
    expect(dialogSource).toContain('handleSave');
    expect(dialogSource).toContain('refreshSearchResults');
    expect(dialogSource).toContain("setSaveState('saving')");
    expect(dialogSource).toContain("setSaveState('saved')");
    expect(dialogSource).not.toContain('searchSettingsLimitsApplied');
  });

  it('re-runs limits saves as a fresh search so the new window applies at once', () => {
    // 限制 tab 改的是窗口本身：保存后必须按"新检索"重跑（窗口重置为新步长），
    // 不能用原位重跑（旧窗口会让新步长/上限不生效，事项 26）。
    expect(dialogSource).toContain('store.searchFiles(store.searchQuery)');
    expect(dialogSource).toContain('isLimits');
  });

  it('locks rev2 review fixes (Phase 4)', () => {
    // F1：limits 落盘前本地计算钳制 + 收敛，不读 stale 快照做不变量检查。
    expect(dialogSource).toContain('nextMax = nextPage');
    expect(dialogSource).toContain('nextPage = nextMax');
    // F5：打开聚焦面板 + 关闭归还焦点。
    expect(dialogSource).toContain('panelRef.current?.focus()');
    expect(dialogSource).toContain('prevFocusRef');
    // F2：tree 容器无 gap（虚拟占位按 ROW_HEIGHT 精确计算）。
    const settingsCss = readFileSync(
      new URL('../../../styles/regions/rightpanel/search-settings.css', import.meta.url),
      'utf8',
    );
    expect(settingsCss).toContain('gap: 0;');
    // F3：虚拟占位是 li（ul 下不允许 div）。
    expect(treeSource).toContain('className="adl-search-ignore__spacer"');
    expect(treeSource).not.toMatch(/<div[^>]*\n\s*className="adl-search-ignore__spacer"/);
    // slice N1：max 下限取 max(200, 当前步长），page ≤ max 在 slice 层闭合。
    expect(searchSliceSource).toContain('Math.max(SEARCH_PAGE_SIZE, _get().searchPageSize)');
  });

  it('keeps every new label in i18n (zh + en parity)', () => {
    const keys = [
      'searchShort',
      'searchSettings',
      'searchSettingsTitle',
      'searchSettingsIgnoreTab',
      'searchSettingsLimitsTab',
      'searchSettingsClose',
      'searchSettingsSave',
      'searchSettingsSaved',
      'searchIgnoreHelpManualTitle',
      'searchIgnoreHelpManualBody',
      'searchIgnoreHelpGitignoreTitle',
      'searchIgnoreHelpGitignoreBody',
      'searchIgnoreHelpCombineTitle',
      'searchIgnoreHelpCombineBody',
      'searchIgnoreHelpSaveTitle',
      'searchIgnoreHelpSaveBody',
      'searchLimitsHelpNumbersTitle',
      'searchLimitsHelpNumbersBody',
      'searchLimitsHelpTooSmallTitle',
      'searchLimitsHelpTooSmallBody',
      'searchLimitsHelpTooBigTitle',
      'searchLimitsHelpTooBigBody',
      'searchLimitsHelpInvalidTitle',
      'searchLimitsHelpInvalidBody',
      'searchLimitsHelpSaveTitle',
      'searchLimitsHelpSaveBody',
      'searchSettingsUseGitignore',
      'searchSettingsPageSize',
      'searchSettingsMaxResults',
      'searchSettingsOverLimitWarn',
      'searchSettingsCheckItem',
      'searchSettingsEmptyTree',
      'searchSettingsSave',
      'searchSettingsIgnoreHintTitle',
      'searchSettingsLimitsHintTitle',
    ];
    for (const key of keys) {
      expect(fileZh[key as keyof typeof fileZh], `zh missing ${key}`).toBeTruthy();
      expect(fileEn[key as keyof typeof fileEn], `en missing ${key}`).toBeTruthy();
    }
    expect(dialogSource).toContain("formatT(t, 'searchSettingsCheckItem'");
  });
});
