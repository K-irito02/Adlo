import type { SettingsGroupId } from '@shared/ipc';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';
import type { CopyDict } from '../../i18n';
import { DEFAULT_COMMANDS, type CommandGroup } from '../../commands/defaultCommands';
import {
  DEFAULT_DEBUG_LOG_MODE,
  DEFAULT_FONTS,
  DEFAULT_KEYBINDS,
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
 * 未接入 patch 工厂的组：dsh 无按钮、无行为；storage/browser 有按钮但走自有流程
 * （侧边栏只切组 + 置 pending 信号，确认对话框与多步执行由 StorageSettings /
 * BrowserSettings 承接，见 uiSlice `storageGroupResetPending` / `browserGroupResetPending`）。
 *
 * 类型不变式：`RESETTABLE_GROUPS ⊇ keys(GROUP_RESET_PATCHES)`，差集仅允许 `storage`、`browser`。
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
  shortcuts: () => ({
    keybinds: { ...DEFAULT_KEYBINDS },
  }),
};

/**
 * 侧边栏渲染重置按钮的组 = patch 工厂键 + storage + browser（自有流程见上）。
 *
 * 通用消费者不得直接取 `GROUP_RESET_PATCHES[group]`（storage/browser 无工厂）——
 * 用 `getGroupResetPatch(group)`（storage/browser 返回 null，调用方走自有流程），
 * `SettingsPanel.handleRequestResetGroup` 已对 storage/browser 提前分支；
 * `SettingsPanel.test.tsx` 的"单注册表"用例锁定该差集（task4 M-2）。
 */
export const RESETTABLE_GROUPS: ReadonlySet<SettingsGroupId> = new Set([
  ...(Object.keys(GROUP_RESET_PATCHES) as SettingsGroupId[]),
  'storage',
  'browser',
]);

/**
 * 组级重置 patch 单一入口：偏好直写组返回 patch，storage/browser 返回 null
 * （调用方走 StorageSettings / BrowserSettings 自有确认对话框与多步流程）。
 * 直接索引 `GROUP_RESET_PATCHES[group]` 是非惯用法（storage/browser 会拿到 undefined）。
 */
export function getGroupResetPatch(group: SettingsGroupId): AppPreferencePatch | null {
  if (group === 'storage' || group === 'browser') {
    return null;
  }
  return GROUP_RESET_PATCHES[group]?.() ?? null;
}

/**
 * 字符串数组元素级比对（undefined 视为非默认，保持启用 fail-open）。
 * SettingsPanel / WorkspaceSettings / SettingsControls 共用，防漂移。
 */
export function isStringArrayEqual(
  actual: readonly string[] | undefined,
  expected: readonly string[] | undefined,
): boolean {
  return (
    actual !== undefined &&
    expected !== undefined &&
    actual.length === expected.length &&
    actual.every((v, i) => v === expected[i])
  );
}

/**
 * 快捷键是否全默认（缺 key 视为该命令 defaultKeybind，无默认视为 'none'——
 * 与 KeybindSettings.currentOf 同语义）。块内按钮与侧边栏行共用，防漂移。
 * 传 group 则只判定该分组（块级用），不传判定全部（侧边栏行用）。
 */
export function isKeybindsAtDefault(
  keybinds: Record<string, string | undefined>,
  group?: CommandGroup,
): boolean {
  return DEFAULT_COMMANDS.filter((cmd) => !group || cmd.group === group).every(
    (cmd) => (keybinds[cmd.id] ?? cmd.defaultKeybind ?? 'none') === (cmd.defaultKeybind ?? 'none'),
  );
}

/** 工作区四字段快照（本地编辑态 / store config 均可），与重置 patch 同源判定。 */
export interface WorkspaceResetValues {
  maxConcurrentWorkspaces: number | undefined;
  workspacePriorityIds: readonly string[] | undefined;
  workspaceDeferredIds: readonly string[] | undefined;
  workspaceNaturalOrder: readonly string[] | undefined;
}

/**
 * 工作区是否全默认：与 `GROUP_RESET_PATCHES.workspace()` 输出逐项比对。
 * 块内按钮（本地态）与侧边栏行（config）共用，防"常量 vs 工厂"漂移。
 */
export function isWorkspaceAtDefault(values: WorkspaceResetValues): boolean {
  const patch = GROUP_RESET_PATCHES.workspace?.();
  if (!patch) {
    return false;
  }
  return (
    values.maxConcurrentWorkspaces === patch.maxConcurrentWorkspaces &&
    isStringArrayEqual(values.workspacePriorityIds, patch.workspacePriorityIds) &&
    isStringArrayEqual(values.workspaceDeferredIds, patch.workspaceDeferredIds) &&
    isStringArrayEqual(values.workspaceNaturalOrder, patch.workspaceNaturalOrder)
  );
}

/** 偏好 patch 与当前值逐项比对（嵌套对象递归，数组元素级）：工厂加字段自动纳入。 */
export function isPatchSatisfied(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): boolean {
  return Object.entries(patch).every(([key, expected]) => {
    const actual = current[key];
    if (Array.isArray(expected) || Array.isArray(actual)) {
      return (
        Array.isArray(expected) &&
        Array.isArray(actual) &&
        expected.length === actual.length &&
        expected.every((v, i) => v === (actual as unknown[])[i])
      );
    }
    if (
      expected !== null &&
      typeof expected === 'object' &&
      actual !== null &&
      typeof actual === 'object'
    ) {
      return isPatchSatisfied(
        actual as Record<string, unknown>,
        expected as Record<string, unknown>,
      );
    }
    return actual === expected;
  });
}
