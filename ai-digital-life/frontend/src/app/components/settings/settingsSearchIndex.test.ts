import { describe, it, expect } from 'vitest';
import type { CopyDict } from '@i18n';
import type { SettingItem } from '@shared/ipc';
import { buildSettingsSearchIndex, filterSearchIndex, anchorFor } from './settingsSearchIndex';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

// 代表性 fixture：通用组条目由传入 settings 派生，需至少一条才能覆盖 general 组
// （索引不为空 settings 凭空造通用条目，否则会与真实「通用」设置项漂移）。
const settings: SettingItem[] = [
  {
    id: 'language',
    groupId: 'general',
    label: 'Language',
    description: 'App display language',
    type: 'select',
    value: 'system',
  },
];

const index = buildSettingsSearchIndex({ t: mockT, settings, keybinds: {} });

describe('buildSettingsSearchIndex', () => {
  it('覆盖全部 6 个组', () => {
    const groups = new Set(index.map((e) => e.group));
    for (const g of ['general', 'workspace', 'shortcuts', 'browser', 'dsh', 'storage'] as const) {
      expect(groups.has(g)).toBe(true);
    }
  });

  it('快捷键组逐命令生成条目（含命令 id 作为关键词）', () => {
    const shortcut = index.filter((e) => e.group === 'shortcuts');
    expect(shortcut.length).toBeGreaterThan(0);
    expect(shortcut.some((e) => e.keywords?.includes('workspace.new'))).toBe(true);
  });

  it('每条 entry 的 anchorId 非空且 anchorFor 组合为 group:id', () => {
    for (const e of index) {
      expect(e.anchorId.length).toBeGreaterThan(0);
      expect(anchorFor(e.group, e.anchorId)).toBe(`${e.group}:${e.anchorId}`);
    }
  });

  it('锚点在索引内唯一', () => {
    const keys = index.map((e) => anchorFor(e.group, e.anchorId));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('filterSearchIndex', () => {
  it('空查询返回全部', () => {
    expect(filterSearchIndex(index, '   ')).toHaveLength(index.length);
  });

  it('命中 label 与 keywords（大小写不敏感）', () => {
    expect(filterSearchIndex(index, 'WORKSPACE.NEW').some((e) => e.group === 'shortcuts')).toBe(
      true,
    );
  });
});
