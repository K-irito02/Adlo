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
 * 组级重置 patch 工厂（偏好直写组）：按钮渲染与执行行为同源。
 * 未接入的组（shortcuts/browser/dsh 为独立组件/独立存储）无按钮、无行为。
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

/**
 * 侧边栏渲染重置按钮的组 = patch 工厂键 + storage。
 * storage 例外：核心路径/树缓存/下载分属独立存储，没有统一偏好 patch，不走
 * updatePreferences；侧边栏只切组 + 置 pending 信号，确认对话框与多步执行由
 * StorageSettings 承接（见 uiSlice `storageGroupResetPending`）。
 *
 * 类型不变式：`RESETTABLE_GROUPS ⊇ keys(GROUP_RESET_PATCHES)`，差集仅允许 `storage`。
 * 通用消费者不得直接取 `GROUP_RESET_PATCHES[group]`（storage 无工厂）——
 * `SettingsPanel.handleRequestResetGroup` 已对 storage 提前分支；
 * `SettingsPanel.test.tsx` 的"单注册表"用例锁定该差集（task4 M-2）。
 */
export const RESETTABLE_GROUPS: ReadonlySet<SettingsGroupId> = new Set([
  ...(Object.keys(GROUP_RESET_PATCHES) as SettingsGroupId[]),
  'storage',
]);
