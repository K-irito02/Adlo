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
 * 「浏览器下载路径」块的行：存储组（`browserDownload`）与浏览器组（`downloadPath`）
 * 渲染的是同一个组件（`DownloadPathBlock`），行文案自然同源，登记也只留一份。
 */
const DOWNLOAD_PATH_ROWS: BlockRowEntry[] = [
  { labelKey: 'storageDownloadMigrateLabel', hintKeys: ['storageDownloadMigrateHint'] },
  { labelKey: 'browserDownloadSettingsPath', hintKeys: ['browserDownloadSettingsPathDesc'] },
];

/**
 * 各组「段/块」锚点与文案 key 的就近声明（单一真源：此处登记 + 组件挂同名锚点）。
 * 仅覆盖由固定块构成、且不由传入 `settings` 派生的组：workspace / storage /
 * browser / dsh / network / environment。
 * `general` 由传入 `settings` 逐项派生，`shortcuts` 由 `DEFAULT_COMMANDS` 逐命令派生。
 *
 * `rows` 覆盖块内的行副标题与提示说明：块级固定组件的行文案写在各自 JSX 里，
 * 不像 `general` 那样有 `SettingItem` 可派生，故在此逐行登记 key（TS 保证 key 存在）；
 * 展开后的每一条即条目侧的 `SettingsSearchEntry.details`（登记叫 `rows`、条目叫 `details`，
 * 前者是「块里有哪些行」、后者是「展开出的可搜索文案」）。
 * 登记与渲染的一致性由 `settingsSearchAnchors.test.tsx` 的守卫用例强制（锚点 + 行标记双断言）。
 *
 * 有意不登记的文案（范围口径）：
 * - 运行时数值 / 状态读数（路径、用量、时间、计数、`{占位符}` 插值后的结果）；
 * - 下拉选项 label、纯 aria 标签；
 * - 条件渲染的块（如「待迁移任务」，仅 `status.pending` 时出现）—— 登记它会产生一条
 *   默认渲染下不存在的锚点，索引里留下永远够不到的落点；
 * - 非 `.adl-settings-row` 的卡片内容（如工作区块内的清单卡片，其文案不是「块内行」）。
 *
 * 守卫覆盖范围：行标记守卫校验「locate ↔ DOM 属性」，**不**校验 `text` 是否真的被渲染
 *（帮助卡/提示类文案默认不可见，无法用简单的 DOM 文本包含断言覆盖）—— text 侧的
 * 登记正确性靠评审保证，新增行文案时须同步核对组件确实渲染了该 key。
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
    anchorId: 'browserDownload',
    labelKey: 'storageBrowserDownloadTitle',
    rows: DOWNLOAD_PATH_ROWS,
  },
  {
    group: 'storage',
    anchorId: 'immutable',
    labelKey: 'storageImmutableTitle',
    rows: STORAGE_IMMUTABLE_ROWS,
  },
  {
    // 「数据位置索引」卡片：恒常渲染但没有块主标题（行主文案即其标题），
    // 故与 workspace 的 maxConcurrentWorkspaces 同法：块主标题就是该行文案。
    group: 'storage',
    anchorId: 'locator',
    labelKey: 'storageLocatorTitle',
    rows: [{ labelKey: 'storageLocatorTitle', hintKeys: ['storageLocatorHint'] }],
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
    rows: DOWNLOAD_PATH_ROWS,
  },
  {
    // 网络组三块：复用 dsh 域源/代理/测试三块文案 key（Task 3 Ruling：key 只是
    // 标识符，不迁移领域）。行级文案与 DshSettings 搬迁前同源（Task 5 填充三块时补登记）。
    group: 'network',
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
    group: 'network',
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
    group: 'network',
    anchorId: 'test',
    labelKey: 'dshSettingsTestConnection',
    rows: [
      {
        labelKey: 'dshSettingsTestLabel',
        hintKeys: ['dshSettingsTestDesc', 'dshSettingsTestHint'],
      },
    ],
  },
  {
    // 「版本管理」块内六行：版本来源行、当前版本行、检查更新行、正式版本行、预发布行、官方版本信息行。
    group: 'dsh',
    anchorId: 'version',
    labelKey: 'dshVersionManagement',
    rows: [
      {
        labelKey: 'dshVersionSource',
        hintKeys: ['dshVersionSourceDesc', 'dshVersionSourceHint'],
      },
      {
        labelKey: 'dshCurrentVersionLabel',
        hintKeys: ['dshCurrentVersionDesc', 'dshCurrentVersionHint'],
      },
      {
        labelKey: 'dshCheckUpdate',
        hintKeys: ['dshCheckUpdateDesc', 'dshCheckUpdateHint'],
      },
      {
        labelKey: 'dshOfficialStable',
        hintKeys: ['dshOfficialStableDesc', 'dshOfficialStableHint'],
      },
      {
        labelKey: 'dshPrereleaseTitle',
        hintKeys: ['dshPrereleaseDesc', 'dshPrereleaseHint'],
      },
      {
        labelKey: 'dshOfficialLinksLabel',
        hintKeys: ['dshOfficialLinksDesc'],
      },
    ],
  },
  {
    // 环境组：单块八行 —— 安装/切换/卸载/重装/重测/复制/复制全部/前往配置。
    // 卸载/重装仅在宿主来源且已安装的行渲染（条件行），行级落点经
    // `data-settings-row` 同名标记（Phase 3 随按钮一起加回）。
    group: 'environment',
    anchorId: 'deps',
    labelKey: 'environmentTitle',
    descriptionKey: 'environmentDesc',
    rows: [
      { labelKey: 'environmentInstall' },
      { labelKey: 'environmentSwitch' },
      { labelKey: 'environmentUninstall' },
      { labelKey: 'environmentReinstall' },
      { labelKey: 'environmentRecheck' },
      { labelKey: 'environmentCopyForAgent' },
      { labelKey: 'environmentCopyAllForAgent' },
      { labelKey: 'environmentGoToSettings' },
    ],
  },
];

/** 模板占位符（如 `{size}` / `{count}`）：对用户可见文案而言它们不该出现，索引里折叠成省略号。 */
const PLACEHOLDER_PATTERN = /\{[^}]*\}/g;

/**
 * 展开一个块内所有行的文案（每行：主文案作定位、副标题在前提示在后），供匹配与「命中行」补显。
 *
 * 两条有意规则：
 * 1. `locate` 取**原文**（与 DOM 上 `data-settings-row` 的取值逐字相同，同一个 i18n key）；
 *    `text` 才做占位符折叠 —— 例如含 `{count}` 的行，可见文本是插值结果，
 *    若把模板原样当搜索/补显文案，用户会看到 `{count}` 这类内部名。
 * 2. 与块主标题**同值**的行文案不重复登记：命中块主标题时 `matchedDetail` 本就不会返回行文案，
 *    登记只会给索引多一条永不返回的匹配文本（该行仍靠 `locate` 参与行级落点）。
 */
function blockDetails(entry: BlockEntry, t: CopyDict): SettingsSearchDetail[] {
  const blockLabel = t[entry.labelKey];
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
    for (const raw of [labelText, ...hintTexts]) {
      if (!raw || raw === blockLabel) {
        continue;
      }
      details.push({ text: collapsePlaceholders(raw), locate });
    }
  }
  return details;
}

/** 模板占位符折叠为省略号：对用户可见的补显文案里不该出现 `{size}` 这类内部名。 */
function collapsePlaceholders(text: string): string {
  return text.replace(PLACEHOLDER_PATTERN, '…');
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
    ? // 块级说明与行文案同口径折叠占位符：未来任何 descriptionKey 带上 `{…}` 时，
      // 补显行不会漏出内部占位名（26-F1 的同类回归在此一并防住）。
      { text: collapsePlaceholders(entry.description) }
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
