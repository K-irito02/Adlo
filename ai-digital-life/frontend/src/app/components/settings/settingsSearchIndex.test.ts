import { describe, it, expect } from 'vitest';
import type { CopyDict } from '@i18n';
import type { SettingItem } from '@shared/ipc';
import {
  CATEGORY_COPY,
  CATEGORY_KEYS_WITHOUT_OWN_ROW,
} from '@features/storage-settings/storageCategoryCopy';
import { IMMOVABLE_COPY } from '@features/storage-settings/storageImmutableCopy';
import {
  buildSettingsSearchIndex,
  filterSearchIndex,
  matchedDetail,
  anchorFor,
} from './settingsSearchIndex';

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

  it('environment 共享落点标记只登记一次，复制全部使用独立标记', () => {
    const env = index.find((entry) => entry.group === 'environment')!;
    const locates = (env.details ?? []).map((detail) => detail.locate as string);
    const countOf = (locate: string) => locates.filter((value) => value === locate).length;
    // 「前往配置」行已随「网络与模型」块删除，不再登记。
    expect(countOf('environmentGoToSettings')).toBe(0);
    expect(countOf('environmentCopyAllForAgent')).toBe(1);
    expect(countOf('environmentCopyForAgent')).toBe(1);
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

  it('命中块内行文案（details）时同样筛出该块', () => {
    const hits = filterSearchIndex(index, 'storageCategoryClipboardDesc');
    expect(hits.some((e) => e.group === 'storage' && e.anchorId === 'corePaths')).toBe(true);
  });

  it('命中行提示说明时同样筛出该块', () => {
    const hits = filterSearchIndex(index, 'treeCacheEnabledHint');
    expect(hits.some((e) => e.group === 'storage' && e.anchorId === 'treeCache')).toBe(true);
  });
});

describe('块条目携带的行文案（details）', () => {
  const blockOf = (anchorId: string) => index.find((e) => e.anchorId === anchorId)!;
  const textsOf = (anchorId: string) => blockOf(anchorId).details!.map((detail) => detail.text);

  it('存储分类行随 CATEGORY_COPY 派生（名称 + 说明 + 关联各一条），并排除不占行的分类', () => {
    const corePaths = blockOf('corePaths');
    const rowCategories = Object.entries(CATEGORY_COPY).filter(
      ([key]) => !CATEGORY_KEYS_WITHOUT_OWN_ROW.includes(key),
    );
    // 两条固定行（模式 / 路径）+ 每个占行的分类 × (name + desc + related)
    expect(corePaths.details).toHaveLength(4 + rowCategories.length * 3);
    const texts = textsOf('corePaths');
    for (const [, copy] of rowCategories) {
      expect(texts).toContain(copy.name);
      expect(texts).toContain(copy.desc);
      expect(texts).toContain(copy.related);
    }
    // 不占分类行的分类（并入浏览器下载路径块）：索引不得登记「永远不存在的行」。
    for (const key of CATEGORY_KEYS_WITHOUT_OWN_ROW) {
      expect(texts).not.toContain(CATEGORY_COPY[key as keyof typeof CATEGORY_COPY].name);
    }
  });

  it('每一条行文案都带「该行的定位文案」：有副标题取副标题，否则取首条提示', () => {
    for (const entry of index) {
      for (const detail of entry.details ?? []) {
        expect(detail.locate, `${entry.anchorId}/${detail.text}`).toBeTruthy();
      }
    }
    // 分类行的三条文案（名称/说明/关联）都指回同一行（名称）。
    for (const detail of blockOf('corePaths').details!) {
      if (detail.text === CATEGORY_COPY.clipboard.desc) {
        expect(detail.locate).toBe(CATEGORY_COPY.clipboard.name);
      }
    }
  });

  it('不可移动行随 IMMOVABLE_COPY 派生（名称 + 说明各一条）', () => {
    const immutable = blockOf('immutable');
    expect(immutable.details).toHaveLength(Object.keys(IMMOVABLE_COPY).length * 2);
    const texts = textsOf('immutable');
    for (const copy of Object.values(IMMOVABLE_COPY)) {
      expect(texts).toContain(copy.name);
      expect(texts).toContain(copy.desc);
    }
  });

  it('工作区块的说明仍走 description（块主标题 + 说明的既有口径不回归）', () => {
    const workspaceBlock = blockOf('maxConcurrentWorkspaces');
    expect(workspaceBlock.description).toBe('maxConcurrentWorkspacesDesc');
    expect(workspaceBlock.details).toEqual([]);
  });

  it('DSH「测试连接」块主标题入索引（此前无锚点、搜不到）', () => {
    expect(blockOf('test').label).toBe('dshSettingsTestConnection');
  });

  it('存储「数据位置索引」卡片入索引（恒常渲染、此前无锚点无登记）', () => {
    const locator = blockOf('locator');
    expect(locator.label).toBe('storageLocatorTitle');
    expect(locator.details?.map((detail) => detail.text)).toEqual(['storageLocatorHint']);
    expect(locator.details?.[0].locate).toBe('storageLocatorTitle');
  });

  it('与块主标题同值的行文案不重复登记，但该行仍参与行级落点', () => {
    // 命中块主标题时 matchedDetail 本就不会返回行文案：重复登记只会多一条永不返回的匹配文本。
    for (const anchorId of ['performance', 'source']) {
      const entry = blockOf(anchorId);
      const texts = entry.details!.map((detail) => detail.text);
      expect(texts).not.toContain(entry.label);
      expect(entry.details!.some((detail) => detail.locate === entry.label)).toBe(true);
    }
  });

  it('模板文案折叠占位符（补显不出现 {used} 这类内部名），定位文案仍是原文', () => {
    // mockT 返回 key 名、不含占位符，故这里用真模板观察折叠行为。
    // 借 corePaths 块「模式」行的副标题注入占位符模板：text 折叠、locate 保留原文。
    const templateT = new Proxy({} as Record<string, string>, {
      get: (_, key) =>
        key === 'storageModeLabel'
          ? '已用 {used}，上限 {limit}'
          : typeof key === 'string'
            ? key
            : '',
    }) as unknown as CopyDict;
    const corePaths = buildSettingsSearchIndex({
      t: templateT,
      settings: [] as SettingItem[],
      keybinds: {},
    }).find((entry) => entry.anchorId === 'corePaths')!;
    const used = corePaths.details!.find((detail) => detail.text === '已用 …，上限 …');
    expect(used?.text).not.toContain('{');
    expect(used?.locate).toBe('已用 {used}，上限 {limit}');
  });
});

describe('matchedDetail：命中行 + 跳转落点文案', () => {
  const blockOf = (anchorId: string) => index.find((e) => e.anchorId === anchorId)!;

  it('命中行提示说明时返回该行文案与其定位文案', () => {
    const detail = matchedDetail(blockOf('treeCache'), 'treeCacheEnabledHint');
    expect(detail).toEqual({ text: 'treeCacheEnabledHint', locate: 'treeCacheEnabled' });
  });

  it('命中行副标题时同样返回定位文案', () => {
    const detail = matchedDetail(blockOf('corePaths'), 'storageCategoryClipboard');
    expect(detail?.locate).toBe('storageCategoryClipboard');
  });

  it('块主标题自身命中时不返回命中行（命中词已在标题上高亮）', () => {
    expect(matchedDetail(blockOf('treeCache'), 'treeCacheTitle')).toBeUndefined();
  });

  it('只有块级说明命中时回落该说明且无定位文案（落点回退块锚点）', () => {
    const detail = matchedDetail(blockOf('maxConcurrentWorkspaces'), 'maxConcurrentWorkspacesDesc');
    expect(detail).toEqual({ text: 'maxConcurrentWorkspacesDesc' });
    expect(detail?.locate).toBeUndefined();
  });

  it('块级说明命中时同样折叠占位符（与行文案口径对称，防 `{used}` 漏出）', () => {
    // 当前唯一 descriptionKey 不含占位符；构造带占位符的说明直接验证折叠路径。
    const detail = matchedDetail(
      { ...blockOf('maxConcurrentWorkspaces'), description: '已用 {used}，上限 {limit}' },
      '已用',
    );
    expect(detail?.text).toBe('已用 …，上限 …');
    expect(detail?.locate).toBeUndefined();
  });
});
