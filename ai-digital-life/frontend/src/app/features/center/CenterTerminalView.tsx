import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { terminalSelectors } from '@stores/selectors';
import { IconPlus, IconAddTerminal, IconAutoLayout, IconCustomLayout } from '@icons';
import { SettingsSelect } from '@components/settings/SettingsSelect';
import { TooltipSimple } from '@components/Tooltip';
import { TerminalPaneGrid } from '@components/terminal/TerminalPaneGrid';
import { TerminalPaneView } from '@components/terminal/TerminalPaneView';
import { TerminalLayoutCard } from '@components/terminal/TerminalLayoutCard';
import { TerminalMenuDropdown } from '@features/terminal/TerminalMenuDropdown';
import { useEqualOnlyLayoutCardCloser, useLayoutCard } from '@features/terminal/useLayoutCard';
import type { TerminalProfile } from '@stores/types';
import { useTCopy } from '@i18n/useTCopy';
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
 * 顶部工具栏**只含**「菜单」，不含新建终端复合按钮与左侧目录导航；
 * 主区渲染单个实时 `XtermTerminal`（含清空按钮）。
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

/** 已绑定终端标签的中心视图：工具栏子集 + 单个实时终端主区。 */
function CenterTerminalSession({ terminalTabId }: { terminalTabId: string }) {
  const { t } = useTCopy();

  const tab = useAppStore((s) => s.terminalTabsById[terminalTabId]);
  // 窗格边界线 / 活动高亮总开关（更多终端操作），经 TerminalPaneGrid 落到分割线/描边。
  const showPaneBorders = useAppStore((s) => s.terminalShowPaneBorders);
  const showActiveHighlight = useAppStore((s) => s.terminalShowActiveHighlight);
  // 布局容器：包裹终端网格的滚动区。C2 布局 Hook 拖拽期在其上写 CSS 变量
  // （`--adl-term-*`），并测量其尺寸换算拖拽比例；变量沿 DOM 继承到内层网格。
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const view = useTerminalView(tab, gridContainerRef);

  // 有效的活动窗格：优先 `activePaneId`，缺失/悬空时回退首个窗格。网格高亮与
  // 菜单动作（shell 管理用的 `view.activePane`）必须指向同一窗格，故此处派生一次。
  const effectiveActivePaneId = view.activePane?.id;

  // 窗格最大化态为视图本地态：切换标签、增删窗格或切换布局模式时复位
  // （spec §8：均分/自由切换清空最大化）。
  // 用 useLayoutEffect 在 DOM 变更后、浏览器绘制前复位，避免切标签时出现一帧“空窗格”。
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null);
  const paneCount = tab?.panes.length ?? 0;
  useLayoutEffect(() => {
    setMaximizedPaneId(null);
  }, [terminalTabId, paneCount, view.layout.mode]);

  // 自定义布局卡片：开合本地态 + 锚点 ref + 外部点击/Esc 关闭（共享 Hook）。
  // 仅均分模式提供入口：自由模式下不渲染按钮，已打开的卡片随模式切换关闭。
  const {
    open: layoutCardOpen,
    anchorRef: layoutCardRef,
    toggle: toggleLayoutCard,
    close: closeLayoutCard,
  } = useLayoutCard();

  useEqualOnlyLayoutCardCloser(view.layout.mode, layoutCardOpen, closeLayoutCard);

  // 布局卡片双重门控共用同一判定（按钮渲染 + 卡片渲染），与上面的自动关闭 hook 一致。
  const isEqualLayout = view.layout.mode === 'equal';

  if (!tab) {
    return null;
  }

  return (
    <div className="adl-tool-panel adl-tool-panel--terminal adl-center-terminal">
      {/* 中间区终端工具栏布局（跟进 24，中心专属）：
          - 左侧组：分段控制器（均分/自由）+ 恢复自动布局 + 增加终端 +
            自定义布局（含卡片锚点），全部靠左；
          - 右侧组：只留「更多终端操作」菜单。
          注意：这只是中心视图的排布，右侧面板 TerminalPanel 的工具栏保持原样
          （左侧导航 + 右侧操作组），改这里不要动那边。 */}
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolTerminal}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
          <div
            className="adl-tool-context__diff-view"
            role="group"
            aria-label={t.terminalLayoutModeLabel}
          >
            <button
              type="button"
              className={`adl-tool-context__toggle-btn${view.layout.mode === 'equal' ? ' is-active' : ''}`}
              aria-pressed={view.layout.mode === 'equal'}
              onClick={() => view.setMode('equal')}
            >
              {t.terminalLayoutEqual}
            </button>
            <button
              type="button"
              className={`adl-tool-context__toggle-btn${view.layout.mode === 'free' ? ' is-active' : ''}`}
              aria-pressed={view.layout.mode === 'free'}
              onClick={() => view.setMode('free')}
            >
              {t.terminalLayoutFree}
            </button>
          </div>
          <TooltipSimple content={t.terminalAutoLayout} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={view.resetAuto}
              aria-label={t.terminalAutoLayout}
            >
              <IconAutoLayout size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.terminalAddPane} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn"
              onClick={() => view.handleAddPane()}
              aria-label={t.terminalAddPane}
            >
              <IconAddTerminal size={14} decorative />
            </button>
          </TooltipSimple>
          {/* 自定义布局按钮（含卡片锚点）同样靠左：卡片相对整个工具栏定位，
              锚点容器搬到左组不影响开合与外部点击判定（判定只看是否包含卡片 DOM）。
              仅均分模式渲染，自由模式隐藏（跟进 2 既有语义，保持不变）。 */}
          <div className="adl-layout-card-anchor" ref={layoutCardRef}>
            {isEqualLayout ? (
              <TooltipSimple content={t.terminalCustomLayout} placement="top">
                <button
                  type="button"
                  className={`adl-tool-context__iconbtn${layoutCardOpen ? ' is-open' : ''}`}
                  onClick={toggleLayoutCard}
                  aria-label={t.terminalCustomLayout}
                  aria-haspopup="dialog"
                  aria-expanded={layoutCardOpen}
                >
                  <IconCustomLayout size={14} decorative />
                </button>
              </TooltipSimple>
            ) : null}
            {layoutCardOpen && isEqualLayout ? (
              <TerminalLayoutCard
                panes={tab.panes}
                onMove={view.handleReorderPanes}
                onSwap={view.handleSwapPanes}
                onLabelChange={view.handlePaneLabelChange}
                onClose={closeLayoutCard}
              />
            ) : null}
          </div>
        </div>
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
            className="adl-tool-primary__scroll adl-tool-primary__scroll--terminal"
            ref={gridContainerRef}
          >
            <TerminalPaneGrid
              panes={tab.panes}
              activePaneId={effectiveActivePaneId}
              maximizedPaneId={maximizedPaneId}
              layout={view.layout}
              showBorders={showPaneBorders}
              showActiveHighlight={showActiveHighlight}
              dividerLabel={t.terminalPaneResizeDivider}
              onColDividerPointerDown={view.handleColDividerPointerDown}
              onRowDividerPointerDown={view.handleRowDividerPointerDown}
              onFreeDragPointerDown={view.handleFreeDragPointerDown}
              renderPane={(pane) => (
                <TerminalPaneView
                  pane={pane}
                  isActive={pane.id === effectiveActivePaneId}
                  isMaximized={maximizedPaneId === pane.id}
                  onActivate={() => view.handleSelectPane(pane.id)}
                  onClose={() => view.handleClosePane(pane.id)}
                  onToggleMaximize={() =>
                    setMaximizedPaneId((cur) => (cur === pane.id ? null : pane.id))
                  }
                  onData={(data) => view.handleXtermData(pane.id, data)}
                  onResize={(cols, rows) => view.handleXtermResize(pane.id, cols, rows)}
                  titles={{
                    clear: t.terminalPaneClearLabel,
                    maximize: t.terminalPaneMaximize,
                    restore: t.terminalPaneRestore,
                    close: t.terminalPaneClose,
                  }}
                />
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
