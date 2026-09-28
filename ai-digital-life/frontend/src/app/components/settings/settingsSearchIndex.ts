import type { CopyDict } from '@i18n';
import type { SettingItem, SettingsGroupId } from '@shared/ipc';
import { formatKeybind } from '@shared/keybinds';
import { DEFAULT_COMMANDS } from '@app/commands/defaultCommands';

export interface SettingsSearchEntry {
  group: SettingsGroupId;
  anchorId: string;
  label: string;
  description?: string;
  keywords?: string[];
}

export function anchorFor(group: SettingsGroupId, anchorId: string): string {
  return `${group}:${anchorId}`;
}

/**
 * 各组「段/块」锚点与文案 key 的就近声明（单一真源：此处登记 + 组件挂同名锚点）。
 * 仅覆盖由固定块构成、且不由传入 `settings` 派生的组：workspace / storage / browser / dsh。
 * `general` 由传入 `settings` 逐项派生，`shortcuts` 由 `DEFAULT_COMMANDS` 逐命令派生。
 */
const GROUP_BLOCK_ENTRIES: {
  group: SettingsGroupId;
  anchorId: string;
  labelKey: keyof CopyDict;
  descriptionKey?: keyof CopyDict;
}[] = [
  {
    group: 'workspace',
    anchorId: 'maxConcurrentWorkspaces',
    labelKey: 'maxConcurrentWorkspaces',
    descriptionKey: 'maxConcurrentWorkspacesDesc',
  },
  { group: 'storage', anchorId: 'corePaths', labelKey: 'storageCorePathsTitle' },
  { group: 'storage', anchorId: 'treeCache', labelKey: 'treeCacheTitle' },
  { group: 'storage', anchorId: 'terminalBudget', labelKey: 'storageTerminalBudgetTitle' },
  { group: 'storage', anchorId: 'browserDownload', labelKey: 'storageBrowserDownloadTitle' },
  { group: 'storage', anchorId: 'immutable', labelKey: 'storageImmutableTitle' },
  { group: 'browser', anchorId: 'performance', labelKey: 'browserSettingsSuspendTitle' },
  { group: 'browser', anchorId: 'downloadMode', labelKey: 'browserDownloadSettingsTitle' },
  { group: 'browser', anchorId: 'downloadPath', labelKey: 'storageBrowserDownloadTitle' },
  { group: 'dsh', anchorId: 'source', labelKey: 'dshSettingsSource' },
  { group: 'dsh', anchorId: 'proxy', labelKey: 'dshSettingsProxy' },
];

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
      keywords: [cmd.id, formatKeybind(binding), binding],
    };
  });
  const blocks = GROUP_BLOCK_ENTRIES.map((entry) => ({
    group: entry.group,
    anchorId: entry.anchorId,
    label: input.t[entry.labelKey],
    description: entry.descriptionKey ? input.t[entry.descriptionKey] : undefined,
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
    [entry.label, entry.description ?? '', ...(entry.keywords ?? [])].some((text) =>
      text.toLowerCase().includes(q),
    ),
  );
}
