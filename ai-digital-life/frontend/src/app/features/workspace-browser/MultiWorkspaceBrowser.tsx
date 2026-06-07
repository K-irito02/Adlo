import React from 'react';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { BrowserTabState, TabFolderState } from '../../stores/slices/browserslice';
import type { CopyDict } from '../../i18n';

export interface MultiWorkspaceBrowserProps {
  workspaces: RecentWorkspaceEntry[];
  tabFolders?: TabFolderState[];
  browserTabs: BrowserTabState[];
  activeTabId: string | null;
  t?: CopyDict;
}

export function MultiWorkspaceBrowser({ browserTabs, t }: MultiWorkspaceBrowserProps) {
  return (
    <div className="adl-multitree adl-multitree--browser">
      <div className="adl-multitree__empty">
        <p className="adl-empty-hint">
          {browserTabs.length > 0 ? `共 ${browserTabs.length} 个标签` : (t?.workspaceEmpty ?? '')}
        </p>
      </div>
    </div>
  );
}
