import type { SettingsGroupId } from '@shared/ipc';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';
import type { CopyDict } from '../../i18n';
import type { GroupKey } from '@shared/settings-reset/types';
import { DEFAULT_COMMANDS, type CommandGroup } from '../../commands/defaultCommands';
import {
  DEFAULT_DEBUG_LOG_MODE,
  DEFAULT_FONTS,
  DEFAULT_KEYBINDS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MAX_CONCURRENT_WORKSPACES,
  DEFAULT_TERMINAL_LOG_MODE,
  DEFAULT_WORKSPACE_DEFERRED_IDS,
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
 * 「恢复全部默认」执行组（`GroupKey`）→ 展示名 i18n key。
 * `preferences` 为 general + workspace + shortcuts 的合称（无单组标签），沿用
 * `settingsResetAllScopePreferences`（分组清单 UI 已删，仅此键保留作组展示名）；
 * 其余三组与 `SETTINGS_GROUPS[].labelKey` 同源。
 * 供 ResetAllDialog 的进度文案与 SettingsPanel 的失败汇总共用，防两处漂移。
 */
export const RESET_ALL_GROUP_LABEL_KEYS: Record<GroupKey, keyof CopyDict> = {
  preferences: 'settingsResetAllScopePreferences',
  browser: 'settingsBrowser',
  dsh: 'settingsDsh',
  storage: 'storageTitle',
};

/**
 * 组级重置 patch 工厂（偏好直写组）：按钮渲染与执行行为同源。
 * 未接入 patch 工厂的组：storage/browser/dsh 走自有流程（侧边栏只切组 +
 * 置 pending 信号，确认对话框与执行由 StorageSettings / BrowserSettings /
 * DshSettings 承接，见 uiSlice `*GroupResetPending`）。
 *
 * 类型不变式：`RESETTABLE_GROUPS ⊇ keys(GROUP_RESET_PATCHES)`，差集仅允许
 * `storage`、`browser`、`dsh`。
 */
export const GROUP_RESET_PATCHES: Partial<Record<SettingsGroupId, () => AppPreferencePatch>> = {
  // 刻意不含 language / themeMode：二者是用户个人基线（跟随系统或用户选定值），
  // 组级恢复默认不改动语言/主题（产品决策 2026-09-27）。侧边栏「全默认」判定
  // （isPatchSatisfied 对本 patch）因此也不含二者 —— 语言/主题恒视为已默认。
  general: () => ({
    logLevel: DEFAULT_LOG_LEVEL,
    terminalLogMode: DEFAULT_TERMINAL_LOG_MODE,
    debugLogMode: DEFAULT_DEBUG_LOG_MODE,
    fonts: { ...DEFAULT_FONTS },
  }),
  workspace: () => ({
    maxConcurrentWorkspaces: DEFAULT_MAX_CONCURRENT_WORKSPACES,
    workspacePriorityIds: [...DEFAULT_WORKSPACE_PRIORITY_IDS],
    workspaceDeferredIds: [...DEFAULT_WORKSPACE_DEFERRED_IDS],
    // 刻意不含 workspaceNaturalOrder：加载顺序由列表操作与自动同步（见
    // workspaceNaturalOrderSync）维护，组级恢复不触碰它（事项 12b）。
  }),
  shortcuts: () => ({
    keybinds: { ...DEFAULT_KEYBINDS },
  }),
};

/**
 * 侧边栏渲染重置按钮的组 = patch 工厂键 + storage + browser + dsh（自有流程见上）。
 *
 * 通用消费者不得直接取 `GROUP_RESET_PATCHES[group]`（storage/browser/dsh 无工厂）——
 * 用 `getGroupResetPatch(group)`（三组返回 null，调用方走自有流程），
 * `SettingsPanel.handleRequestResetGroup` 已对三组提前分支；
 * `SettingsPanel.test.tsx` 的"单注册表"用例锁定该差集（task4 M-2）。
 */
export const RESETTABLE_GROUPS: ReadonlySet<SettingsGroupId> = new Set([
  ...(Object.keys(GROUP_RESET_PATCHES) as SettingsGroupId[]),
  'storage',
  'browser',
  'dsh',
]);

/**
 * 组级重置 patch 单一入口：偏好直写组返回 patch，storage/browser/dsh 返回 null
 * （调用方走各组自有确认对话框与多步流程）。
 * 直接索引 `GROUP_RESET_PATCHES[group]` 是非惯用法（三组会拿到 undefined）。
 */
export function getGroupResetPatch(group: SettingsGroupId): AppPreferencePatch | null {
  if (group === 'storage' || group === 'browser' || group === 'dsh') {
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

/** 工作区三字段快照（本地编辑态 / store config 均可），与重置 patch 同源判定。
 *  不含 `workspaceNaturalOrder`：它被自动同步自动写入（有工作区即非空），
 *  参与判定会让组恢复按钮永不禁用；且已移出重置 patch（事项 12b）。 */
export interface WorkspaceResetValues {
  maxConcurrentWorkspaces: number | undefined;
  workspacePriorityIds: readonly string[] | undefined;
  workspaceDeferredIds: readonly string[] | undefined;
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
    isStringArrayEqual(values.workspaceDeferredIds, patch.workspaceDeferredIds)
  );
}

/**
 * 偏好 patch 与当前值逐项比对（嵌套对象递归，数组元素级）：工厂加字段自动纳入。
 *
 * 口径补充（事项 12a）：`null`（Rust `Option::None` 序列化）与「空串」默认等价——
 * `config.fonts` 为 null 时仍视为已默认，否则「通用」组恢复按钮永远无法禁用。
 * 仅 `expected === ''` 时放宽（叶子级），非空默认值缺失仍判非默认（fail-open）。
 */
export function isPatchSatisfied(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): boolean {
  return Object.entries(patch).every(([key, expected]) => {
    const actual = current[key];
    if (Array.isArray(expected) || Array.isArray(actual)) {
      // 任一侧非数组 → 不相等（fail-open 非默认）；同时堵住 actual 为 null 时
      // `(null)[i]` 索引抛 TypeError 的预存脆弱（Phase 4 R3-12a-L1）。
      if (!Array.isArray(expected) || !Array.isArray(actual)) {
        return false;
      }
      return (
        expected.length === actual.length &&
        expected.every((v, i) => v === (actual as unknown[])[i])
      );
    }
    if (expected !== null && typeof expected === 'object') {
      // 整个对象缺失/null（如 config.fonts = null）：按空对象递归，
      // 叶子走下方 null≡'' 口径；对象内非空默认值缺失照常判非默认。
      if (actual === null || actual === undefined) {
        return isPatchSatisfied({}, expected as Record<string, unknown>);
      }
      if (typeof actual === 'object') {
        return isPatchSatisfied(
          actual as Record<string, unknown>,
          expected as Record<string, unknown>,
        );
      }
      return false;
    }
    if (expected === '' && (actual === null || actual === undefined)) {
      return true;
    }
    return actual === expected;
  });
}
