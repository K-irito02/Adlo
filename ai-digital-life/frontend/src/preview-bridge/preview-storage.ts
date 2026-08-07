import type { AppInfo, RecentWorkspaceEntry } from '@ai-digital-life/kernel';

const PREVIEW_RECENT_STORAGE_KEY = 'adl.preview.recent-workspaces.v1';
const PREVIEW_PREFERENCES_STORAGE_KEY = 'adl.preview.preferences.v1';
const PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY = 'adl.preview.active-workspace.v1';
const PREVIEW_CUSTOM_PROVIDERS_STORAGE_KEY = 'adl.preview.custom-providers.v1';

type PreviewPreferenceState = Pick<
  AppInfo['config'],
  'language' | 'themeMode' | 'resolvedTheme' | 'modelPreferences'
>;

export interface PreviewCustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
}

export function loadRecentWorkspaces(): RecentWorkspaceEntry[] {
  try {
    const raw = window.localStorage.getItem(PREVIEW_RECENT_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as RecentWorkspaceEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('preview-storage: loadRecentWorkspaces failed:', err);
    return [];
  }
}

export function persistRecentWorkspaces(entries: RecentWorkspaceEntry[]) {
  try {
    window.localStorage.setItem(PREVIEW_RECENT_STORAGE_KEY, JSON.stringify(entries.slice(0, 12)));
  } catch (err) {
    console.warn('preview-storage: persistRecentWorkspaces failed:', err);
  }
}

const MOCK_SEED_WORKSPACES: RecentWorkspaceEntry[] = Array.from({ length: 5 }, (_, index) => {
  const n = index + 1;
  return {
    id: `mock-seed-workspace-${n}`,
    path: `E:/Mock-Workspace-${n}`,
    rootPath: `E:/Mock-Workspace-${n}`,
    name: `模拟工作区 ${n}`,
    lastOpenedAt: Date.now() - n,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: n,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  };
});

export function seedMockRecentWorkspaces(entries: RecentWorkspaceEntry[]): RecentWorkspaceEntry[] {
  const seen = new Set(entries.map((entry) => entry.path));
  return [...MOCK_SEED_WORKSPACES.filter((entry) => !seen.has(entry.path)), ...entries];
}

export function updateRecentWorkspaces(
  currentEntries: RecentWorkspaceEntry[],
  entry: RecentWorkspaceEntry,
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
  } catch (err) {
    console.warn('preview-storage: loadPreviewPreferences failed:', err);
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
      } satisfies PreviewPreferenceState),
    );
  } catch (err) {
    console.warn('preview-storage: persistPreviewPreferences failed:', err);
  }
}

export function loadActiveWorkspacePath(): string | undefined {
  try {
    return window.localStorage.getItem(PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY)?.trim() || undefined;
  } catch (err) {
    console.warn('preview-storage: loadActiveWorkspacePath failed:', err);
    return undefined;
  }
}

export function loadPreviewCustomProviders(): PreviewCustomProvider[] {
  try {
    const raw = window.localStorage.getItem(PREVIEW_CUSTOM_PROVIDERS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as PreviewCustomProvider[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('preview-storage: loadPreviewCustomProviders failed:', err);
    return [];
  }
}

export function persistPreviewCustomProviders(providers: PreviewCustomProvider[]) {
  try {
    window.localStorage.setItem(PREVIEW_CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(providers));
  } catch (err) {
    console.warn('preview-storage: persistPreviewCustomProviders failed:', err);
  }
}

export function persistActiveWorkspacePath(workspacePath?: string) {
  try {
    if (!workspacePath?.trim()) {
      window.localStorage.removeItem(PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(PREVIEW_ACTIVE_WORKSPACE_STORAGE_KEY, workspacePath.trim());
  } catch (err) {
    console.warn('preview-storage: persistActiveWorkspacePath failed:', err);
  }
}
