import React from "react";
import { QuickActions, type QuickActionsProps } from "./QuickActions";
import { SessionManagement, type SessionManagementProps } from "./SessionManagement";
import { EnvironmentControls, type EnvironmentControlsProps } from "./EnvironmentControls";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LeftSidebarProps
  extends QuickActionsProps,
    SessionManagementProps,
    Omit<EnvironmentControlsProps, "onChangeLanguage" | "onChangeTheme"> {
  /** Language change handler (delegated to parent). */
  onChangeLanguage: (lang: string) => void;
  /** Theme change handler (delegated to parent). */
  onChangeTheme: (theme: "light" | "dark" | "system") => void;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

/**
 * Left Sidebar (Regions 5-7) - The primary navigation panel for the AI Digital Life desktop app.
 *
 * Layout structure:
 *
 *  +----------------------------------+
 *  |  Region 5: QuickActions          |  <- Fixed top, icon toolbar
 *  +----------------------------------+
 *  |                                  |
 *  |  Region 6: SessionManagement     |  <- Flex-1 scrollable area
 *  |   - Workspace Tabs               |     (workspace list + sessions)
 *  |   - Session List                 |
 *  |                                  |
 *  |                                  |
 *  +----------------------------------+
 *  |  Region 7: EnvironmentControls   |  <- Fixed bottom, stays pinned
 *  +----------------------------------+
 *
 * Dimensions:
 *  - Width: var(--sidebar-width) = 260px
 *  - Background: var(--surface-sunken)
 *  - Border-right: 1px solid var(--border-subtle)
 */
export function LeftSidebar({
  /* QuickActions */
  activeAction,
  mcpStatus,
  onSkillsClick,
  onMcpClick,
  onNewWorkspace,
  /* SessionManagement */
  sessions,
  activeSessionId,
  workspaces,
  onCreateSession,
  onSelectSession,
  onSelectWorkspace,
  /* EnvironmentControls */
  currentLanguage,
  currentTheme,
  onChangeLanguage,
  onChangeTheme,
}: LeftSidebarProps): React.ReactElement {
  return (
    <aside className="sidebar-left" role="navigation" aria-label="Left sidebar">
      {/* Region 5 - Quick action buttons */}
      <QuickActions
        activeAction={activeAction}
        mcpStatus={mcpStatus}
        onSkillsClick={onSkillsClick}
        onMcpClick={onMcpClick}
        onNewWorkspace={onNewWorkspace}
      />

      {/* Region 6 - Session management (scrollable) */}
      <SessionManagement
        sessions={sessions}
        activeSessionId={activeSessionId}
        workspaces={workspaces}
        onCreateSession={onCreateSession}
        onNewWorkspace={onNewWorkspace}
        onSelectSession={onSelectSession}
        onSelectWorkspace={onSelectWorkspace}
      />

      {/* Region 7 - Environment controls (fixed bottom) */}
      <EnvironmentControls
        currentLanguage={currentLanguage}
        currentTheme={currentTheme}
        onChangeLanguage={onChangeLanguage}
        onChangeTheme={onChangeTheme}
      />
    </aside>
  );
}

export default LeftSidebar;
