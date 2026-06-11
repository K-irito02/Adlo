import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';

const PREVIEW_RECENT_STORAGE_KEY = 'adl.preview.recent-workspaces.v1';
const PREVIEW_PREFERENCES_STORAGE_KEY = 'adl.preview.preferences.v1';
const PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY = 'adl.preview.active-workspace.v1';

type PreviewPreferenceState = Pick<
  AppInfo['config'],
  'language' | 'themeMode' | 'resolvedTheme' | 'modelPreferences'
>;
import type { AppInfo } from '@ai-digital-life/kernel';

export function loadRecentWorkspaces(): RecentWorkspaceEntry[] {
  try {
    const raw = window.localStorage.getItem(PREVIEW_RECENT_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as RecentWorkspaceEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistRecentWorkspaces(entries: RecentWorkspaceEntry[]) {
  try {
    window.localStorage.setItem(PREVIEW_RECENT_STORAGE_KEY, JSON.stringify(entries.slice(0, 12)));
  } catch {
    // ignore persistence errors in preview mode
  }
}

export function updateRecentWorkspaces(
  currentEntries: RecentWorkspaceEntry[],
  entry: RecentWorkspaceEntry
): RecentWorkspaceEntry[] {
  const next = [entry, ...currentEntries.filter((candidate) => candidate.path !== entry.path)];
  const normalized = next.map((candidate, index) => ({
    ...candidate,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: index,
    removedFromSidebar: false,
    available: true,
  }));
  persistRecentWorkspaces(normalized);
  return normalized;
}

export function loadPreviewPreferences(): Partial<PreviewPreferenceState> {
  try {
    const raw = window.localStorage.getItem(PREVIEW_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Partial<PreviewPreferenceState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function persistPreviewPreferences(config: PreviewPreferenceState) {
  try {
    window.localStorage.setItem(
      PREVIEW_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        language: config.language,
        themeMode: config.themeMode,
        resolvedTheme: config.resolvedTheme,
        modelPreferences: config.modelPreferences,
      } satisfies PreviewPreferenceState)
    );
  } catch {
    // ignore persistence errors in preview mode
  }
}

export function loadActiveWorkspacePath(): string | undefined {
  try {
    return window.localStorage.getItem(PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function persistActiveWorkspacePath(workspacePath?: string) {
  try {
    if (!workspacePath?.trim()) {
      window.localStorage.removeItem(PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY, workspacePath.trim());
  } catch {
    // ignore persistence errors in preview mode
  }
}
