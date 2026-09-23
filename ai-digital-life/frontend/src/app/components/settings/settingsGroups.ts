import type { SettingsGroupId } from '@shared/ipc';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';
import type { CopyDict } from '../../i18n';
import {
  DEFAULT_DEBUG_LOG_MODE,
  DEFAULT_FONTS,
  DEFAULT_LANGUAGE,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MAX_CONCURRENT_WORKSPACES,
  DEFAULT_TERMINAL_LOG_MODE,
  DEFAULT_THEME_MODE,
  DEFAULT_WORKSPACE_DEFERRED_IDS,
  DEFAULT_WORKSPACE_NATURAL_ORDER,
  DEFAULT_WORKSPACE_PRIORITY_IDS,
} from '../../../shared/defaultPreferences';

/**
 * 设置导航的组顺序与标签（单一真源）。
 * 独立于 `SettingsNav.tsx`：组件文件不得导出常量（`react-refresh/only-export-components`），
 * 且 `SettingsPanel` 需要用它把失效的 `activeGroup` 回退到第一个组。
 */
export const SETTINGS_GROUPS: { id: SettingsGroupId; labelKey: keyof CopyDict }[] = [
  { id: 'general', labelKey: 'settingsGeneral' },
  { id: 'workspace', labelKey: 'settingsWorkspace' },
  { id: 'storage', labelKey: 'storageTitle' },
  { id: 'shortcuts', labelKey: 'settingsShortcuts' },
  { id: 'browser', labelKey: 'settingsBrowser' },
  { id: 'dsh', labelKey: 'settingsDsh' },
];

/**
 * 组级重置 patch 工厂（单一真相源）：按钮渲染与执行行为同源。
 * 未接入的组（storage/shortcuts/browser/dsh 为独立组件/独立存储）无按钮、无行为。
 */
export const GROUP_RESET_PATCHES: Partial<Record<SettingsGroupId, () => AppPreferencePatch>> = {
  general: () => ({
    language: DEFAULT_LANGUAGE,
    themeMode: DEFAULT_THEME_MODE,
    logLevel: DEFAULT_LOG_LEVEL,
    terminalLogMode: DEFAULT_TERMINAL_LOG_MODE,
    debugLogMode: DEFAULT_DEBUG_LOG_MODE,
    fonts: { ...DEFAULT_FONTS },
  }),
  workspace: () => ({
    maxConcurrentWorkspaces: DEFAULT_MAX_CONCURRENT_WORKSPACES,
    workspacePriorityIds: [...DEFAULT_WORKSPACE_PRIORITY_IDS],
    workspaceDeferredIds: [...DEFAULT_WORKSPACE_DEFERRED_IDS],
    workspaceNaturalOrder: [...DEFAULT_WORKSPACE_NATURAL_ORDER],
  }),
};

/** 组级重置已接入默认映射的组，由 patch 工厂派生（与执行行为同源）。 */
export const RESETTABLE_GROUPS: ReadonlySet<SettingsGroupId> = new Set(
  Object.keys(GROUP_RESET_PATCHES) as SettingsGroupId[],
);
