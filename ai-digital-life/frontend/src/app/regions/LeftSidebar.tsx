import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ReorderWorkspacesInput } from '@ai-digital-life/kernel';
import { useTCopy } from '../i18n/useTCopy';
import { IconPlug, IconSparkles } from '../icons';
import { useAppStore } from '../stores/slicedStore';
import { useAppActions } from '../hooks/useAppActions';
import { TooltipSimple } from '../components/Tooltip';
import { SidebarContextMenu } from './left-sidebar/SidebarContextMenu';
import type { SidebarMenuState } from './left-sidebar/SidebarContextMenu.utils';
import { buildWorkspaceMenuItems } from './left-sidebar/SidebarContextMenu.utils';
import { ResizeHandle } from './left-sidebar/ResizeHandle';
import { WorkspaceList } from './left-sidebar/WorkspaceList';
import { asWorkspaceID } from '../../shared/branded';

interface LeftSidebarProps {
  collapsed: boolean;
  onTriggerCreateWorkspace: () => void;
}

const LeftSidebar = React.memo(function LeftSidebar({
  collapsed,
  onTriggerCreateWorkspace,
}: LeftSidebarProps) {
  const { t } = useTCopy();
  const actions = useAppActions();
  const { appInfo, recentWorkspaces } = useAppStore(
    useShallow((s) => ({
      appInfo: s.appInfo,
      recentWorkspaces: s.recentWorkspaces,
    })),
  );
  const [menuState, setMenuState] = useState<SidebarMenuState>();

  const reorderWorkspaces = actions.reorderWorkspaces as unknown as (
    input: ReorderWorkspacesInput,
  ) => Promise<void>;

  const visibleWorkspaces = recentWorkspaces.filter((entry) => !entry.removedFromSidebar);
  const currentWorkspace = appInfo?.currentWorkspace
    ? { id: appInfo.currentWorkspace.id, path: appInfo.currentWorkspace.path }
    : undefined;

  const menuWorkspace =
    menuState?.type === 'workspace'
      ? visibleWorkspaces.find((workspace) => workspace.id === menuState.workspaceId)
      : undefined;

  return (
    <aside
      className={`adl-leftbar${collapsed ? ' adl-leftbar--collapsed' : ''}`}
      aria-label={t.sidebarNavigator}
      aria-hidden={collapsed}
    >
      <div className="adl-leftbar__content">
        <section className="adl-leftbar__quick">
          <TooltipSimple
            content={`${t.quickSkills} · ${t.quickSkillsComingSoon}`}
            placement="right"
          >
            <button type="button" className="adl-quick-btn" disabled>
              <IconSparkles size={16} decorative />
              <span className="adl-quick-btn__label">{t.quickSkills}</span>
            </button>
          </TooltipSimple>
          <TooltipSimple content={`${t.quickMcp} · ${t.quickSkillsComingSoon}`} placement="right">
            <button type="button" className="adl-quick-btn" disabled>
              <IconPlug size={16} decorative />
              <span className="adl-quick-btn__label">{t.quickMcp}</span>
              <span className="adl-status-lamp adl-status-lamp--read" aria-hidden="true" />
            </button>
          </TooltipSimple>
        </section>

        <WorkspaceList
          workspaceItems={visibleWorkspaces}
          currentWorkspace={currentWorkspace}
          onReorderWorkspaces={(input) => void reorderWorkspaces(input)}
          onPinWorkspace={(id: string) => actions.pinWorkspace(asWorkspaceID(id))}
          onUnpinWorkspace={(id: string) => actions.unpinWorkspace(asWorkspaceID(id))}
          onTriggerCreateWorkspace={onTriggerCreateWorkspace}
          onContextMenu={(workspaceId, x, y) =>
            setMenuState({ type: 'workspace', workspaceId, x, y })
          }
        />
      </div>

      {menuState?.type === 'workspace' && menuWorkspace ? (
        <SidebarContextMenu
          items={buildWorkspaceMenuItems(menuWorkspace, t, {
            onPinWorkspace: (id: string) => actions.pinWorkspace(asWorkspaceID(id)),
            onUnpinWorkspace: (id: string) => actions.unpinWorkspace(asWorkspaceID(id)),
            onRemoveWorkspace: (id: string) =>
              actions.removeWorkspaceFromSidebar(asWorkspaceID(id)),
            onRevealWorkspace: actions.revealWorkspaceInFileManager,
            onShowInRightPanels: (id: string) =>
              actions.showWorkspaceInRightPanels(asWorkspaceID(id)),
          })}
          x={menuState.x}
          y={menuState.y}
          onClose={() => setMenuState(undefined)}
        />
      ) : null}

      <ResizeHandle />
    </aside>
  );
});

export { LeftSidebar };
