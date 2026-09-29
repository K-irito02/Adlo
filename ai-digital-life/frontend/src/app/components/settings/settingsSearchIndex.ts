import type { CopyDict } from '@i18n';
import type { SettingItem, SettingsGroupId } from '@shared/ipc';
import { formatKeybind } from '@shared/keybinds';
import { DEFAULT_COMMANDS } from '@app/commands/defaultCommands';
import {
  CATEGORY_COPY,
  CATEGORY_KEYS_WITHOUT_OWN_ROW,
} from '@features/storage-settings/storageCategoryCopy';
import { IMMOVABLE_COPY } from '@features/storage-settings/storageImmutableCopy';
import { matchIndexOf } from './settingsHighlight';

export interface SettingsSearchEntry {
  group: SettingsGroupId;
  anchorId: string;
  label: string;
  description?: string;
  /**
   * 块内行级文案（行副标题 / 副标题下方的提示说明 / 行内「?」帮助卡文案）。
   * 只参与匹配与「命中行」补显，不参与结果标题渲染 —— 块主标题才是结果的标题。
   */
  details?: SettingsSearchDetail[];
  keywords?: string[];
}

/** 块内一行的一条可搜索文案。 */
export interface SettingsSearchDetail {
  /** 命中文案本体（用于匹配与结果行补显） */
  text: string;
  /**
   * 该行在 DOM 上的定位文案：行容器 `data-settings-row` 的值，取值同源（同一个 i18n key）
   * —— 命中这条文案时，跳转落点用它精确取到那一行，而不是落到块主标题。
   * 行的定位文案取该行的**主文案**（有副标题取副标题，否则取第一条提示/帮助卡文案）。
   * 缺省表示该文案不指向具体行（块级说明），落点回退块锚点。
   */
  locate?: string;
}

export function anchorFor(group: SettingsGroupId, anchorId: string): string {
  return `${group}:${anchorId}`;
}

/** 块内一行的可搜索文案：副标题 + 其下方的提示说明（帮助卡文案同样是该行的说明，一并纳入）。 */
interface BlockRowEntry {
  /** 行副标题（行左上角主文案） */
  labelKey?: keyof CopyDict;
  /** 副标题下方的提示说明 / 行内「?」帮助卡文案（可多段） */
  hintKeys?: (keyof CopyDict)[];
}

interface BlockEntry {
  group: SettingsGroupId;
  anchorId: string;
  /** 块左上方主标题 */
  labelKey: keyof CopyDict;
  /** 块主标题下方的说明（如工作区块）：可被搜索，命中时作为「命中行」补显 */
  descriptionKey?: keyof CopyDict;
  rows?: BlockRowEntry[];
}

/**
 * 「存储」分类行的文案（10 类，与分类列表同口径）：与 `StorageCategoryRow` 取自同一份
 * `CATEGORY_COPY`、同一份排除口径（`CATEGORY_KEYS_WITHOUT_OWN_ROW`），
 * 不另抄字面量 —— 组件改了分类文案或展示范围，索引跟着变，无需两处同步。
 */
const STORAGE_CATEGORY_ROWS: BlockRowEntry[] = Object.entries(CATEGORY_COPY)
  .filter(([key]) => !CATEGORY_KEYS_WITHOUT_OWN_ROW.includes(key))
  .map(([, copy]) => ({
    labelKey: copy.name,
    hintKeys: [copy.desc, copy.related],
  }));

/** 「不可移动」块的行：与 `StorageSettings` 的渲染同源（`IMMOVABLE_COPY`）。 */
const STORAGE_IMMUTABLE_ROWS: BlockRowEntry[] = Object.values(IMMOVABLE_COPY).map((copy) => ({
  labelKey: copy.name,
  hintKeys: [copy.desc],
}));

/**
 * 各组「段/块」锚点与文案 key 的就近声明（单一真源：此处登记 + 组件挂同名锚点）。
 * 仅覆盖由固定块构成、且不由传入 `settings` 派生的组：workspace / storage / browser / dsh。
 * `general` 由传入 `settings` 逐项派生，`shortcuts` 由 `DEFAULT_COMMANDS` 逐命令派生。
 *
 * `rows` 覆盖块内的行副标题与提示说明：块级固定组件的行文案写在各自 JSX 里，
 * 不像 `general` 那样有 `SettingItem` 可派生，故在此逐行登记 key（TS 保证 key 存在）。
 * 登记与渲染的一致性由 `settingsSearchAnchors.test.tsx` 的守卫用例强制（缺行即失败）。
 * 有意不登记的文案：运行时数值（路径/用量/时间/计数）、下拉选项 label、纯 aria 标签。
 */
const GROUP_BLOCK_ENTRIES: BlockEntry[] = [
  {
    group: 'workspace',
    anchorId: 'maxConcurrentWorkspaces',
    labelKey: 'maxConcurrentWorkspaces',
    descriptionKey: 'maxConcurrentWorkspacesDesc',
  },
  {
    group: 'storage',
    anchorId: 'corePaths',
    labelKey: 'storageCorePathsTitle',
    rows: [
      { labelKey: 'storageModeLabel', hintKeys: ['storageModeHint'] },
      { labelKey: 'storageRootLabel', hintKeys: ['storageRootHint'] },
      ...STORAGE_CATEGORY_ROWS,
    ],
  },
  {
    group: 'storage',
    anchorId: 'treeCache',
    labelKey: 'treeCacheTitle',
    rows: [
      { labelKey: 'treeCacheStatsLabel' },
      { labelKey: 'treeCacheEnabled', hintKeys: ['treeCacheEnabledHint'] },
    ],
  },
  {
    group: 'storage',
    anchorId: 'terminalBudget',
    labelKey: 'storageTerminalBudgetTitle',
    rows: [
      {
        labelKey: 'settingsTerminalHistoryBudget',
        hintKeys: ['settingsTerminalHistoryBudgetDesc'],
      },
      { hintKeys: ['settingsTerminalHistoryBudgetFollowDiskDesc'] },
      { hintKeys: ['settingsTerminalHistoryBudgetUsed'] },
    ],
  },
  {
    group: 'storage',
    anchorId: 'browserDownload',
    labelKey: 'storageBrowserDownloadTitle',
    rows: [
      { labelKey: 'storageDownloadMigrateLabel', hintKeys: ['storageDownloadMigrateHint'] },
      { labelKey: 'browserDownloadSettingsPath', hintKeys: ['browserDownloadSettingsPathDesc'] },
    ],
  },
  {
    group: 'storage',
    anchorId: 'immutable',
    labelKey: 'storageImmutableTitle',
    rows: STORAGE_IMMUTABLE_ROWS,
  },
  {
    group: 'browser',
    anchorId: 'performance',
    labelKey: 'browserSettingsSuspendTitle',
    rows: [{ labelKey: 'browserSettingsSuspendTitle', hintKeys: ['browserSettingsSuspendDesc'] }],
  },
  {
    group: 'browser',
    anchorId: 'downloadMode',
    labelKey: 'browserDownloadSettingsTitle',
    rows: [
      { labelKey: 'browserDownloadSettingsMode', hintKeys: ['browserDownloadSettingsModeHint'] },
    ],
  },
  {
    group: 'browser',
    anchorId: 'downloadPath',
    labelKey: 'storageBrowserDownloadTitle',
    rows: [
      { labelKey: 'storageDownloadMigrateLabel', hintKeys: ['storageDownloadMigrateHint'] },
      { labelKey: 'browserDownloadSettingsPath', hintKeys: ['browserDownloadSettingsPathDesc'] },
    ],
  },
  {
    group: 'dsh',
    anchorId: 'source',
    labelKey: 'dshSettingsSource',
    rows: [
      {
        labelKey: 'dshSettingsSource',
        hintKeys: ['dshSettingsSourceDesc', 'dshSettingsSourceHint'],
      },
      { labelKey: 'dshSettingsCustomUrl', hintKeys: ['dshSettingsCustomUrlDesc'] },
    ],
  },
  {
    group: 'dsh',
    anchorId: 'proxy',
    labelKey: 'dshSettingsProxy',
    rows: [
      {
        labelKey: 'dshSettingsProxyMode',
        hintKeys: ['dshSettingsProxyDesc', 'dshSettingsProxyHint'],
      },
      { labelKey: 'dshSettingsProxyHttp' },
      { labelKey: 'dshSettingsProxyHttps' },
      { labelKey: 'dshSettingsProxyNoProxy' },
    ],
  },
  {
    group: 'dsh',
    anchorId: 'test',
    labelKey: 'dshSettingsTestConnection',
    rows: [
      {
        labelKey: 'dshSettingsTestLabel',
        hintKeys: ['dshSettingsTestDesc', 'dshSettingsTestHint'],
      },
    ],
  },
];

/** 展开一个块内所有行的文案（每行：主文案作定位、副标题在前提示在后），供匹配与「命中行」补显。 */
function blockDetails(entry: BlockEntry, t: CopyDict): SettingsSearchDetail[] {
  const details: SettingsSearchDetail[] = [];
  for (const row of entry.rows ?? []) {
    const labelText = row.labelKey ? t[row.labelKey] : undefined;
    const hintTexts = (row.hintKeys ?? []).map((key) => t[key]);
    // 定位文案 = 行的主文案：有副标题用副标题，否则用第一条提示/帮助卡文案
    //（只提示无副标题的行，其自身文案就是该行在 DOM 上的标记值）。
    const locate = labelText ?? hintTexts[0];
    if (!locate) {
      continue;
    }
    for (const text of [labelText, ...hintTexts]) {
      if (text) {
        details.push({ text, locate });
      }
    }
  }
  return details;
}

/**
 * 结果行「命中行」：块主标题没命中时，取该块内**首个命中**的行文案（含其定位文案）；
 * 行文案都没命中而块级说明命中时，回落块级说明（无定位 → 落点回退块锚点）。
 * 主标题自身已命中则返回 undefined —— 命中词已在标题上高亮，再补一行是冗余。
 * 结果列表（补显哪条文案）与跳转落点（落到哪个元素）共用本函数，防两处判定漂移。
 */
export function matchedDetail(
  entry: SettingsSearchEntry,
  query: string,
): SettingsSearchDetail | undefined {
  if (matchIndexOf(entry.label, query) !== -1) {
    return undefined;
  }
  const row = entry.details?.find((detail) => matchIndexOf(detail.text, query) !== -1);
  if (row) {
    return row;
  }
  return entry.description && matchIndexOf(entry.description, query) !== -1
    ? { text: entry.description }
    : undefined;
}

export function buildSettingsSearchIndex(input: {
  t: CopyDict;
  settings: SettingItem[];
  keybinds: Record<string, string | undefined>;
}): SettingsSearchEntry[] {
  const general = input.settings.map((item) => ({
    group: item.groupId,
    anchorId: item.id,
    label: item.label,
    description: item.description,
    keywords: [item.id],
  }));
  const shortcuts = DEFAULT_COMMANDS.map((cmd) => {
    const binding = input.keybinds[cmd.id] ?? cmd.defaultKeybind ?? '';
    return {
      group: 'shortcuts' as const,
      anchorId: cmd.id,
      label: input.t[cmd.titleKey],
      // 无键位命令的 formatKeybind('') 为空串：滤掉空关键词，索引不留空条目。
      keywords: [cmd.id, formatKeybind(binding), binding].filter((keyword) => keyword.length > 0),
    };
  });
  const blocks = GROUP_BLOCK_ENTRIES.map((entry) => ({
    group: entry.group,
    anchorId: entry.anchorId,
    label: input.t[entry.labelKey],
    description: entry.descriptionKey ? input.t[entry.descriptionKey] : undefined,
    details: blockDetails(entry, input.t),
  }));
  return [...general, ...shortcuts, ...blocks];
}

export function filterSearchIndex(
  index: readonly SettingsSearchEntry[],
  query: string,
): SettingsSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...index];
  }
  return index.filter((entry) =>
    [
      entry.label,
      entry.description ?? '',
      ...(entry.details ?? []).map((detail) => detail.text),
      ...(entry.keywords ?? []),
    ].some((text) => text.toLowerCase().includes(q)),
  );
}
