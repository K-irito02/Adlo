import type { CopyKey } from '@i18n';
import type { STORAGE_CATEGORY_KEYS } from '@shared/ipc/storage';

export interface CategoryCopy {
  name: CopyKey;
  desc: CopyKey;
  related: CopyKey;
}

/**
 * 不占分类行的分类：`downloads_default`（默认下载目标）并入「浏览器下载路径」块渲染，
 * 存储分类列表不重复列出它。
 *
 * 渲染侧（StorageSettings 的展示过滤）与设置搜索索引共用本口径 —— 若只在渲染侧过滤，
 * 索引会登记一条永远不存在的行，行级落点会静默退化成「落到块主标题」
 *（该回归由 `settingsSearchAnchors.test.tsx` 的行标记守卫直接拦下）。
 */
export const CATEGORY_KEYS_WITHOUT_OWN_ROW: readonly string[] = ['downloads_default'];

/**
 * 分类 key → i18n key 映射（11 类全覆盖，spec §6.4 要求每类都有「存了什么 + 与什么有关」）。
 * 显式列全而不是拼接字符串：`indexedDB` 之类的 key 规范化不可靠，且显式表能让 TS 校验 key 存在。
 * 独立模块（而非放在组件文件内）以满足 `react-refresh/only-export-components`。
 */
export const CATEGORY_COPY: Record<(typeof STORAGE_CATEGORY_KEYS)[number], CategoryCopy> = {
  database: {
    name: 'storageCategoryDatabase',
    desc: 'storageCategoryDatabaseDesc',
    related: 'storageCategoryDatabaseRelated',
  },
  downloads_db: {
    name: 'storageCategoryDownloadsDb',
    desc: 'storageCategoryDownloadsDbDesc',
    related: 'storageCategoryDownloadsDbRelated',
  },
  site_meta_db: {
    name: 'storageCategorySiteMetaDb',
    desc: 'storageCategorySiteMetaDbDesc',
    related: 'storageCategorySiteMetaDbRelated',
  },
  tree_cache: {
    name: 'storageCategoryTreeCache',
    desc: 'storageCategoryTreeCacheDesc',
    related: 'storageCategoryTreeCacheRelated',
  },
  config: {
    name: 'storageCategoryConfig',
    desc: 'storageCategoryConfigDesc',
    related: 'storageCategoryConfigRelated',
  },
  clipboard: {
    name: 'storageCategoryClipboard',
    desc: 'storageCategoryClipboardDesc',
    related: 'storageCategoryClipboardRelated',
  },
  snapshot: {
    name: 'storageCategorySnapshot',
    desc: 'storageCategorySnapshotDesc',
    related: 'storageCategorySnapshotRelated',
  },
  dsh: {
    name: 'storageCategoryDsh',
    desc: 'storageCategoryDshDesc',
    related: 'storageCategoryDshRelated',
  },
  logs: {
    name: 'storageCategoryLogs',
    desc: 'storageCategoryLogsDesc',
    related: 'storageCategoryLogsRelated',
  },
  credentials_fallback: {
    name: 'storageCategoryCredentialsFallback',
    desc: 'storageCategoryCredentialsFallbackDesc',
    related: 'storageCategoryCredentialsFallbackRelated',
  },
  downloads_default: {
    name: 'storageCategoryDownloadsDefault',
    desc: 'storageCategoryDownloadsDefaultDesc',
    related: 'storageCategoryDownloadsDefaultRelated',
  },
};
