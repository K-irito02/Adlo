import type { RecentWorkspaceEntry } from '@shared/ipc';
import type { BrowserTabState, BookmarkFolder } from '@stores/slices/browserSlice';
import { useTCopy } from '@i18n/useTCopy';

export interface MultiWorkspaceBrowserProps {
  workspaces: RecentWorkspaceEntry[];
  tabFolders?: BookmarkFolder[];
  browserTabs: BrowserTabState[];
  activeTabId: string | null;
}

export function MultiWorkspaceBrowser({ browserTabs }: MultiWorkspaceBrowserProps) {
  const { t, formatT } = useTCopy();
  return (
    <div className="adl-multitree adl-multitree--browser">
      <div className="adl-multitree__empty">
        <p className="adl-empty-hint">
          {browserTabs.length > 0
            ? formatT(t, 'browserTabCount', { count: browserTabs.length })
            : t.workspaceEmpty}
        </p>
      </div>
    </div>
  );
}
