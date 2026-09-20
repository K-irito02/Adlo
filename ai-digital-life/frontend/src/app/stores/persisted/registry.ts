import { defineEntry, readBooleanRecord, type PersistEntry } from './entry';

/**
 * 中心登记表 —— 全局唯一事实来源。
 *
 * 规则：
 * 1. 键名必须符合 parsePersistKey 的规范，且全域唯一（对象字面量重复键在编译期报错；
 *    该编译期保证以 registry 保持为对象字面量为前提，若改为运行时构造的映射
 *    ——如 Object.fromEntries——则必须重新引入运行时唯一性断言）。
 * 2. field 必须全局唯一 —— 同一 store 字段不得由两条键声明。
 * 3. 声明同步读取的条目，单条序列化体积必须 ≤ 32 KB。
 * 以上三条由 __tests__/registrySelfCheck.test.ts 强制校验（键名唯一性除外，见规则 1）。
 */
export const registry = {
  'adl:files.workspaceExpanded': defineEntry<Record<string, boolean>>({
    key: 'adl:files.workspaceExpanded',
    field: 'workspaceTreeExpandedInFileNav',
    fallback: {},
    scope: 'byWorkspaceId',
    read: readBooleanRecord,
  }),
} as const;

export type Registry = typeof registry;

export type RegistryKey = keyof Registry;

export type RegistryValue<K extends RegistryKey> =
  Registry[K] extends PersistEntry<infer T> ? T : never;

/** 供自检测试遍历用（registry 的 as const 类型对遍历不友好） */
export const registryEntries: PersistEntry<unknown>[] = Object.values(
  registry,
) as PersistEntry<unknown>[];

/**
 * 启动清理的保留名单（allowlist）。
 *
 * ⚠️ 安全关键：cleanupUnregisteredKeys() 会删除 adl: 命名空间下所有"不在 registry 内"的键。
 * 迁移是分批进行的（Task 7/9/10/11/21/29），在 registry 完成接管前，
 * **全部遗留键字面量都必须列入本清单**，否则首次启动即清空用户的宽度/展开态/
 * 浏览器标签/终端标签/CI 快照/访问令牌等全部 UI 状态。
 *
 * 本清单由下面的命令生成（不要手工增删）：
 *   cd ai-digital-life && grep -rhoE "'adl-(ui|terminal|search|browser):[a-zA-Z0-9:._-]+'" \
 *     frontend/src --include=*.ts --include=*.tsx | grep -v "__tests__" | sort -u
 *
 * 维护规则（由 __tests__/keepListGuard.test.ts 强制）：
 * 1. 任何遗留键字面量必须"已登记 或 在本清单内" —— 否则守卫测试变红，杜绝漏保护。
 * 2. 本清单不得包含已登记的键 —— 每个迁移任务（Task 7/9/10/11/21/29）必须把自己
 *    刚登记的键从本清单删除，守卫测试会强制这一点（迫使清单逐步收窄）。
 * 3. 全部迁移任务完成后（Task 29），本清单必须为空 —— 此时启动清理才真正开始
 *    清除遗留键，命名空间门禁随之生效。
 */
export const PERSIST_KEEP_KEYS = new Set<string>([
  'adl-search:ignored-paths',
  'adl-search:max-results',
  'adl-search:page-size',
  'adl-search:use-gitignore',
  'adl-terminal:cwd-by-tab',
  'adl-terminal:history-index',
  'adl-terminal:region-collapse',
  'adl-terminal:view-prefs',
  'adl-ui:active-communicate-platform',
  'adl-ui:active-github-section',
  'adl-ui:active-heatmap-tab',
  'adl-ui:active-right-tool',
  'adl-ui:active-workspace-tab',
  'adl-ui:browser-active-tab',
  'adl-ui:browser-bg-config',
  'adl-ui:browser-bookmark-tabid-url-map',
  'adl-ui:browser-bookmarks',
  'adl-ui:browser-configured-ports',
  'adl-ui:browser-history',
  'adl-ui:browser-local-ports',
  'adl-ui:browser-navigate-in-place',
  'adl-ui:browser-navigator-width',
  'adl-ui:browser-shortcuts',
  'adl-ui:browser-tab-folders',
  'adl-ui:browser-tab-tree-expanded',
  'adl-ui:browser-tabs',
  'adl-ui:browser-workspace-bookmarks',
  'adl-ui:browser-workspace-expanded',
  'adl-ui:changes-branch',
  'adl-ui:changes-navigator-mode',
  'adl-ui:changes-navigator-width',
  'adl-ui:changes-preview-enabled',
  'adl-ui:changes-tree-expanded',
  'adl-ui:chart-color-preset',
  'adl-ui:ci-access-token',
  'adl-ui:ci-auto-refresh-on-push',
  'adl-ui:ci-config',
  'adl-ui:ci-log-caches',
  'adl-ui:ci-snapshots',
  'adl-ui:clipboard-scroll-top',
  'adl-ui:communicate-navigator-collapsed',
  'adl-ui:file-preview-mode',
  'adl-ui:file-tree-expanded',
  'adl-ui:files-navigator-mode',
  'adl-ui:files-navigator-width',
  'adl-ui:files-search-scope',
  'adl-ui:files-search-view',
  'adl-ui:github-access-token',
  'adl-ui:github-ci-folders',
  'adl-ui:github-navigator-width',
  'adl-ui:github-workspace-configs',
  'adl-ui:left-collapsed',
  'adl-ui:left-panel-width',
  'adl-ui:navigator-collapsed',
  'adl-ui:right-collapsed',
  'adl-ui:right-panel-last-restorable-width',
  'adl-ui:right-panel-mode',
  'adl-ui:right-panel-width',
  'adl-ui:session-tabs-expanded',
  'adl-ui:settings-navigator-width',
  'adl-ui:show-git-visualization',
  'adl-ui:sysmon-collapsed',
  'adl-ui:sysmon-scroll-top',
  'adl-ui:terminal-active-tab',
  'adl-ui:terminal-default-profile',
  'adl-ui:terminal-navigator-width',
  'adl-ui:terminal-shell-selector-profile',
  'adl-ui:terminal-tabs',
  'adl-ui:terminal-workspace-default-profiles',
  'adl-ui:terminal-workspace-expanded',
  'adl-ui:terminal-workspace-id',
  'adl-ui:workspace-changes-expanded',
  'adl-ui:workspace-tree-expanded',
]);
