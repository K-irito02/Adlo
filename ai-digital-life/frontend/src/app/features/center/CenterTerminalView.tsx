import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { terminalSelectors } from '@stores/selectors';
import { IconAlertTriangle, IconAreaSwap, IconPlus } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { SettingsSelect } from '@components/settings/SettingsSelect';
import { XtermTerminal } from '@components/terminal/XtermTerminal';
import { TerminalHistoryList } from '@components/terminal/TerminalHistoryList';
import { TerminalRegionActions } from '@components/terminal/TerminalRegionActions';
import { TerminalMenuDropdown } from '@features/terminal/TerminalMenuDropdown';
import { readTerminalCellMetrics, readTerminalPalette } from '@features/terminal/terminalXtermPool';
import {
  isCollapseButtonVisible,
  isRegionVisible,
} from '@features/terminal/terminalRegionCollapse';
import { HISTORY_RATIO_MAX, HISTORY_RATIO_MIN } from '@features/terminal/terminalViewPrefs';
import type { TerminalProfile } from '@stores/types';
import { useTCopy } from '@i18n/useTCopy';
import { useResolvedTheme } from '@hooks/useResolvedTheme';
import { useTerminalView } from './useTerminalView';
import './CenterTerminalView.css';

interface CenterTerminalViewProps {
  centerTabId: string;
  terminalTabId: string | null;
}

/** 终端类型均为不可翻译的专有名词，与 useTerminalShellManagement / terminalSlice 保持一致 */
const PROFILE_LABELS: Record<TerminalProfile, string> = {
  powershell: 'PowerShell',
  bash: 'Bash',
  cmd: 'CMD',
};

const PROFILES: TerminalProfile[] = ['powershell', 'bash', 'cmd'];

/**
 * 中心终端视图：承载一个 `location === 'center'` 的终端标签，或（`refId === null`）终端选择器。
 *
 * 顶部工具栏**只含**「单双列 / 区域交换 / 菜单」，不含新建终端复合按钮与左侧目录导航；
 * 主区复用只读历史区 + 分界线 + 实时 `XtermTerminal`（含区域折叠、删除历史）。
 * 视图与叶子 Hook 的接线见 `useTerminalView`。
 */
export function CenterTerminalView({ centerTabId, terminalTabId }: CenterTerminalViewProps) {
  if (terminalTabId === null) {
    return <CenterTerminalChooser centerTabId={centerTabId} />;
  }
  return <CenterTerminalSession terminalTabId={terminalTabId} />;
}

/**
 * 终端选择器（`refId === null`）：profile 列表 + 工作区绑定，未绑定默认 `''`
 * （即「默认终端目录」/ 独立）。选定后创建终端标签、移动到中心并回填中心标签 `refId`。
 */
function CenterTerminalChooser({ centerTabId }: { centerTabId: string }) {
  const { t } = useTCopy();
  const shellSelectorProfile = terminalSelectors.useShellSelectorProfile();
  const recentWorkspaces = useAppStore((s) => s.recentWorkspaces);
  const terminalCreateTab = useAppStore((s) => s.terminalCreateTab);
  const terminalSetLocation = useAppStore((s) => s.terminalSetLocation);
  const centerSetTabRef = useAppStore((s) => s.centerSetTabRef);
  const clampPanelActiveTab = useAppStore((s) => s.clampPanelActiveTab);

  const [profile, setProfile] = useState<TerminalProfile>(shellSelectorProfile);
  const [workspaceId, setWorkspaceId] = useState('');

  const visibleWorkspaces = useMemo(
    () => recentWorkspaces.filter((w) => !w.removedFromSidebar && w.available),
    [recentWorkspaces],
  );

  const workspaceOptions = useMemo(
    () => [
      { value: '', label: t.terminalIndependent },
      ...visibleWorkspaces.map((workspace) => ({ value: workspace.id, label: workspace.name })),
    ],
    [visibleWorkspaces, t],
  );

  // 已选工作区可能在卡片打开期间被移出侧栏 / 变为不可用 → 回退到「默认终端目录」：
  // 既避免下拉展示裸 ID（SettingsSelect 对未知 value 回退显示 value 本身），
  // 也避免用已失效的工作区去建终端。
  const effectiveWorkspaceId = workspaceOptions.some((option) => option.value === workspaceId)
    ? workspaceId
    : '';

  const handleCreate = useCallback(() => {
    // terminalCreateTab 同步写入 store，随后回读新标签 id（与面板 handleCreateTab 同语义）。
    terminalCreateTab(profile, effectiveWorkspaceId);
    const newTabId = useAppStore.getState().terminalActiveTabId;
    if (!newTabId) {
      return;
    }
    terminalSetLocation(newTabId, 'center');
    centerSetTabRef(centerTabId, newTabId);
    // 位置排他：新标签已属中心，面板活动标签必须重夹，否则面板会同时挂载同一 session。
    clampPanelActiveTab();
  }, [
    profile,
    effectiveWorkspaceId,
    centerTabId,
    terminalCreateTab,
    terminalSetLocation,
    centerSetTabRef,
    clampPanelActiveTab,
  ]);

  return (
    <div className="adl-center-terminal adl-center-terminal--chooser">
      <div className="adl-center-terminal__chooser-card">
        <div className="adl-center-terminal__chooser-title">{t.terminalNewTerminal}</div>
        <div
          className="adl-center-terminal__profiles"
          role="group"
          aria-label={t.terminalShellLabel}
        >
          {PROFILES.map((option) => (
            <button
              key={option}
              type="button"
              className={`adl-center-terminal__profile${profile === option ? ' is-active' : ''}`}
              aria-pressed={profile === option}
              onClick={() => setProfile(option)}
            >
              {PROFILE_LABELS[option]}
            </button>
          ))}
        </div>
        <div className="adl-center-terminal__workspace">
          <span className="adl-center-terminal__workspace-label">{t.terminalBindWorkspace}</span>
          <SettingsSelect
            className="adl-center-terminal__workspace-dropdown"
            value={effectiveWorkspaceId}
            options={workspaceOptions}
            onChange={setWorkspaceId}
            label={t.terminalBindWorkspace}
          />
        </div>
        <button
          type="button"
          className="adl-center-terminal__create"
          aria-label={t.menuNewTerminal}
          onClick={handleCreate}
        >
          <IconPlus size={14} decorative />
          <span>{t.menuNewTerminal}</span>
        </button>
      </div>
    </div>
  );
}

/** 已绑定终端标签的中心视图：工具栏子集 + 只读历史/分界线/实时终端主区。 */
function CenterTerminalSession({ terminalTabId }: { terminalTabId: string }) {
  const { t } = useTCopy();
  // 订阅主题以在亮/暗切换时刷新只读历史配色（与 TerminalPanel 同因）。
  useResolvedTheme();
  const historyPalette = readTerminalPalette();

  const tab = useAppStore((s) => s.terminalTabsById[terminalTabId]);
  const view = useTerminalView(tab);

  const readHistoryCellMetrics = useCallback(
    () => readTerminalCellMetrics(tab?.sessionId ?? null),
    [tab?.sessionId],
  );

  if (!tab) {
    return null;
  }

  const hasHistory = view.historySegments.length > 0;
  const isDual = view.viewPrefs.mode === 'dual';
  // 渲染期归一化：历史不存在时只允许「两区都可见」。否则 (hasHistory=false, collapse='live')
  // 会让两区皆不可见且无按钮可恢复 —— 重启后历史索引惰性加载完成前 hasHistory 会短暂为 false，
  // 正是该窗口（详见 terminalRegionCollapse.ts 的约定注释）。
  const collapse = hasHistory ? view.regionCollapse : 'none';
  const historyVisible = isRegionVisible(collapse, 'history', hasHistory);
  const liveVisible = isRegionVisible(collapse, 'live', true);
  const canCollapse = isCollapseButtonVisible(hasHistory);

  // 两个区域共用同一份叠加层文案；「最大化/还原」的可见 title 不带区域名，
  // 区域名只进各自按钮的 aria-label（见 TerminalRegionActions 文件头）。
  const regionActionTitles = {
    restore: t.terminalRegionRestoreTitle,
    maximize: t.terminalRegionMaximizeTitle,
    deleteLabel: t.terminalHistoryDeleteLabel,
    deleteTitle: t.terminalHistoryDeleteTitle,
    clearLabel: t.terminalLiveClearLabel,
    clearTitle: t.terminalLiveClearTitle,
  };

  return (
    <div className="adl-tool-panel adl-tool-panel--terminal adl-center-terminal">
      {/* 中间区工具栏：视图布局 + 交换位置靠左，更多操作靠右（与右面板工具栏顺序不同，按需求） */}
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolTerminal}>
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <TooltipSimple content={t.terminalViewLayoutLabel} placement="top">
            <div
              className="adl-tool-context__diff-view"
              role="group"
              aria-label={t.terminalViewLayoutLabel}
            >
              <button
                type="button"
                className={`adl-tool-context__toggle-btn${isDual ? '' : ' is-active'}`}
                aria-pressed={isDual ? 'false' : 'true'}
                onClick={() => view.setViewMode('single')}
              >
                {t.terminalViewSingle}
              </button>
              <button
                type="button"
                className={`adl-tool-context__toggle-btn${isDual ? ' is-active' : ''}`}
                aria-pressed={isDual ? 'true' : 'false'}
                onClick={() => view.setViewMode('dual')}
              >
                {t.terminalViewDual}
              </button>
            </div>
          </TooltipSimple>
          <TooltipSimple content={t.terminalSwapAreas} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={view.swapAreas}
              aria-label={t.terminalSwapAreas}
              disabled={!hasHistory}
            >
              <IconAreaSwap
                size={14}
                decorative
                orientation={isDual ? 'horizontal' : 'vertical'}
                firstSolid={view.viewPrefs.historyFirst}
              />
            </button>
          </TooltipSimple>
        </div>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files" />
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
          <TerminalMenuDropdown
            menuOpen={view.terminalMenuOpen}
            menuRef={view.terminalMenuRef}
            menuItems={view.terminalMenuItems}
            onToggle={() => view.setTerminalMenuOpen((value) => !value)}
            onClose={() => view.setTerminalMenuOpen(false)}
          />
        </div>
      </div>

      <div className="adl-tool-surface adl-tool-surface--files">
        <div className="adl-tool-primary">
          <div
            ref={view.viewContainerRef}
            className={`adl-tool-primary__scroll adl-tool-primary__scroll--terminal${isDual ? ' is-dual' : ' is-single'}${view.viewPrefs.historyFirst ? '' : ' is-history-last'}`}
            style={
              {
                '--adl-terminal-history-ratio': `${view.viewPrefs.historyRatio}`,
              } as React.CSSProperties
            }
          >
            {historyVisible ? (
              <div className={`adl-terminal-history${liveVisible ? '' : ' is-solo'}`}>
                <TerminalHistoryList
                  segments={view.historySegments}
                  palette={historyPalette}
                  readCellMetrics={readHistoryCellMetrics}
                  unavailableLabel={t.terminalHistorySegmentUnavailable}
                />
                <TerminalRegionActions
                  region="history"
                  collapsedRegion={collapse}
                  canCollapse={canCollapse}
                  onToggleCollapse={() => view.toggleRegionCollapse('history')}
                  onDelete={() => void view.deleteHistory(tab.id)}
                  titles={regionActionTitles}
                  regionName={t.terminalHistoryRegionName}
                  alwaysVisible={!liveVisible}
                />
              </div>
            ) : null}

            {historyVisible && liveVisible ? (
              <div
                className="adl-terminal-divider"
                role="separator"
                aria-orientation={isDual ? 'vertical' : 'horizontal'}
                aria-label={t.terminalDividerLabel}
                aria-valuemin={HISTORY_RATIO_MIN}
                aria-valuemax={HISTORY_RATIO_MAX}
                aria-valuenow={Math.round(view.viewPrefs.historyRatio * 100) / 100}
                onPointerDown={view.handleDividerPointerDown}
              />
            ) : null}

            {liveVisible ? (
              <div className="adl-terminal-live">
                <XtermTerminal
                  ref={view.xtermRef}
                  sessionId={tab.sessionId ?? null}
                  className="adl-terminal-canvas"
                  onData={view.handleXtermData}
                  onResize={view.handleXtermResize}
                />
                <TerminalRegionActions
                  region="live"
                  collapsedRegion={collapse}
                  canCollapse={canCollapse}
                  onToggleCollapse={() => view.toggleRegionCollapse('live')}
                  onClear={view.handleClear}
                  titles={regionActionTitles}
                  regionName={t.terminalLiveRegionName}
                  alwaysVisible={!historyVisible}
                />
              </div>
            ) : null}

            {tab.status === 'terminated' && !tab.sessionId && (
              <div className="adl-terminal-error-note">
                <IconAlertTriangle size={14} decorative />
                <span>{t.terminalShellNotFound}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
