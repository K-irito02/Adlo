import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { terminalSelectors } from '@stores/selectors';
import { IconPlus, IconAddTerminal } from '@icons';
import { SettingsSelect } from '@components/settings/SettingsSelect';
import { TooltipSimple } from '@components/Tooltip';
import { TerminalPaneGrid } from '@components/terminal/TerminalPaneGrid';
import { TerminalPaneView } from '@components/terminal/TerminalPaneView';
import { TerminalMenuDropdown } from '@features/terminal/TerminalMenuDropdown';
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
  const view = useTerminalView(tab);

  // 窗格最大化态为视图本地态：切换标签或增删窗格时复位。
  // 用 useLayoutEffect 在 DOM 变更后、浏览器绘制前复位，避免切标签时出现一帧“空窗格”。
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null);
  const paneCount = tab?.panes.length ?? 0;
  useLayoutEffect(() => {
    setMaximizedPaneId(null);
  }, [terminalTabId, paneCount]);

  if (!tab) {
    return null;
  }

  return (
    <div className="adl-tool-panel adl-tool-panel--terminal adl-center-terminal">
      {/* 中间区工具栏：仅保留「更多操作」菜单 */}
      <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolTerminal}>
        <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files" />
        <div className="adl-tool-context__group adl-tool-context__group--files-actions">
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
          <div className="adl-tool-primary__scroll adl-tool-primary__scroll--terminal">
            <TerminalPaneGrid
              panes={tab.panes}
              activePaneId={tab.activePaneId}
              maximizedPaneId={maximizedPaneId}
              renderPane={(pane) => (
                <TerminalPaneView
                  pane={pane}
                  isActive={pane.id === tab.activePaneId}
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
