import { describe, it, expect } from 'vitest';
import {
  readFlag,
  readNumberInRange,
  readFlooredNumberInRange,
  readStringEnum,
  readBooleanPropRecord,
  readString,
  readStringRecord,
  readNumberArray,
  readStringArray,
  readObjectArray,
  readObjectArrayRecord,
  readSearchUseGitignore,
  readStringSet,
  readDirExpansion,
  readCiRepoConfig,
  readCiSnapshots,
  readCiLogCaches,
  readGitHubWorkspaceConfigs,
  readGitHubCiFolders,
} from '../parsers';

describe('readFlag', () => {
  it('accepts booleans only', () => {
    expect(readFlag(true)).toBe(true);
    expect(readFlag(false)).toBe(false);
    expect(readFlag('true')).toBeUndefined();
    expect(readFlag(1)).toBeUndefined();
    expect(readFlag(null)).toBeUndefined();
  });
});

describe('readNumberInRange', () => {
  it('clamps out-of-range values instead of rejecting them', () => {
    const read = readNumberInRange(180, 260);
    expect(read(200)).toBe(200);
    expect(read(10)).toBe(180);
    expect(read(9999)).toBe(260);
  });

  it('rejects non-finite numbers', () => {
    const read = readNumberInRange(0, 10);
    expect(read('5')).toBeUndefined();
    expect(read(Number.NaN)).toBeUndefined();
    expect(read(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('readFlooredNumberInRange', () => {
  it('floors a fractional value instead of keeping it', () => {
    const read = readFlooredNumberInRange(50, 1000);
    // 承接旧读路径 Math.floor(readNumber(...))：钳制只保留 300.9，取整才是 300。
    expect(read(300.9)).toBe(300);
  });

  it('clamps out-of-range values instead of rejecting them', () => {
    const read = readFlooredNumberInRange(50, 1000);
    expect(read(50)).toBe(50);
    expect(read(10)).toBe(50);
    expect(read(9999)).toBe(1000);
  });

  it('rejects non-numbers and non-finite numbers', () => {
    const read = readFlooredNumberInRange(0, 10);
    expect(read('5')).toBeUndefined();
    expect(read(Number.NaN)).toBeUndefined();
    expect(read(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(read(Number.NEGATIVE_INFINITY)).toBeUndefined();
  });
});

describe('readStringEnum', () => {
  it('accepts only listed members', () => {
    const read = readStringEnum(['tree', 'group'] as const);
    expect(read('tree')).toBe('tree');
    expect(read('group')).toBe('group');
    expect(read('list')).toBeUndefined();
  });
});

describe('readBooleanPropRecord', () => {
  it('accepts a nested boolean map', () => {
    expect(readBooleanPropRecord({ ws1: { src: true } })).toEqual({ ws1: { src: true } });
  });

  it('rejects a flat boolean map', () => {
    expect(readBooleanPropRecord({ ws1: true })).toBeUndefined();
  });

  it('rejects a nested map with a non-boolean leaf', () => {
    expect(readBooleanPropRecord({ ws1: { src: 'yes' } })).toBeUndefined();
  });

  it('rejects arrays and null', () => {
    expect(readBooleanPropRecord([])).toBeUndefined();
    expect(readBooleanPropRecord(null)).toBeUndefined();
  });
});

describe('readString', () => {
  it('accepts strings only', () => {
    expect(readString('tab-1')).toBe('tab-1');
    expect(readString('')).toBe('');
    expect(readString(1)).toBeUndefined();
    expect(readString(null)).toBeUndefined();
  });
});

describe('readStringRecord', () => {
  it('accepts a flat string map', () => {
    expect(readStringRecord({ 'tab-1': 'https://a.test' })).toEqual({ 'tab-1': 'https://a.test' });
  });

  it('rejects non-string values, arrays and null', () => {
    expect(readStringRecord({ 'tab-1': 5 })).toBeUndefined();
    expect(readStringRecord(['https://a.test'])).toBeUndefined();
    expect(readStringRecord(null)).toBeUndefined();
  });
});

describe('readNumberArray', () => {
  it('accepts a finite-number array', () => {
    expect(readNumberArray([3000, 5173])).toEqual([3000, 5173]);
  });

  it('rejects non-arrays and any non-finite element', () => {
    expect(readNumberArray('3000')).toBeUndefined();
    expect(readNumberArray([3000, '5173'])).toBeUndefined();
    expect(readNumberArray([Number.NaN])).toBeUndefined();
    expect(readNumberArray(null)).toBeUndefined();
  });
});

describe('readStringArray', () => {
  it('accepts a string array, empty array included', () => {
    expect(readStringArray(['theme', 'font'])).toEqual(['theme', 'font']);
    expect(readStringArray([])).toEqual([]);
  });

  it('rejects non-arrays and any non-string element', () => {
    expect(readStringArray('theme')).toBeUndefined();
    expect(readStringArray(['theme', 1])).toBeUndefined();
    expect(readStringArray([null])).toBeUndefined();
    expect(readStringArray(null)).toBeUndefined();
  });

  it('truncates to maxLength (oldest entries dropped, read side converges on the cap)', () => {
    expect(readStringArray(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
    // 上限大于实际长度时不补位、不报错。
    expect(readStringArray(['a'], 20)).toEqual(['a']);
  });
});

describe('readObjectArray', () => {
  const isItem = (item: Record<string, unknown>): boolean => typeof item['id'] === 'string';

  it('accepts an array whose items pass the item check', () => {
    expect(readObjectArray<{ id: string }>(isItem)([{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
    ]);
  });

  it('rejects the whole value when one item fails the item check', () => {
    expect(readObjectArray<{ id: string }>(isItem)([{ id: 'a' }, { id: 1 }])).toBeUndefined();
  });

  it('rejects non-arrays, arrays with non-object items and null', () => {
    expect(readObjectArray<{ id: string }>(isItem)({ id: 'a' })).toBeUndefined();
    expect(readObjectArray<{ id: string }>(isItem)([null])).toBeUndefined();
    expect(readObjectArray<{ id: string }>(isItem)(null)).toBeUndefined();
  });
});

describe('readObjectArrayRecord', () => {
  const isItem = (item: Record<string, unknown>): boolean => typeof item['id'] === 'string';

  it('accepts a nested record of item arrays', () => {
    expect(readObjectArrayRecord<{ id: string }>(isItem)({ ws1: [{ id: 'a' }] })).toEqual({
      ws1: [{ id: 'a' }],
    });
  });

  it('rejects a record whose value is not an item array', () => {
    expect(readObjectArrayRecord<{ id: string }>(isItem)({ ws1: { id: 'a' } })).toBeUndefined();
  });

  it('rejects arrays and null', () => {
    expect(readObjectArrayRecord<{ id: string }>(isItem)([])).toBeUndefined();
    expect(readObjectArrayRecord<{ id: string }>(isItem)(null)).toBeUndefined();
  });
});

describe('readSearchUseGitignore', () => {
  it('accepts a per-workspace boolean map', () => {
    expect(readSearchUseGitignore({ ws1: true, ws2: false })).toEqual({ ws1: true, ws2: false });
  });

  it('rejects the whole record when one member is not a boolean', () => {
    // 登记表约定：任一成员畸形即整记录不合法（回退 fallback），而非只丢那一个成员。
    expect(readSearchUseGitignore({ ws1: true, ws2: 'true' })).toBeUndefined();
  });

  it('rejects non-objects and null', () => {
    expect(readSearchUseGitignore([])).toBeUndefined();
    expect(readSearchUseGitignore(null)).toBeUndefined();
  });
});

describe('readDirExpansion', () => {
  it('accepts a well-formed expansion', () => {
    expect(readDirExpansion({ expanded: { src: true }, manualCollapsed: { docs: true } })).toEqual({
      expanded: { src: true },
      manualCollapsed: { docs: true },
    });
  });

  it('accepts an expansion without any manual intent', () => {
    expect(readDirExpansion({ expanded: { src: true } })).toEqual({
      expanded: { src: true },
      manualCollapsed: undefined,
    });
  });

  it('rejects a legacy flat value instead of reading its keys as members', () => {
    // 旧版扁平形状（Task 12 前写盘的）没有 `expanded` 成员，必须整条判非法、回退 fallback，
    // 绝不为旧格式写兼容/迁移代码。
    expect(readDirExpansion({ 'src/legacy': false })).toBeUndefined();
    expect(readDirExpansion({ 'src/legacy': false, src: true })).toBeUndefined();
  });

  it('rejects a non-boolean leaf in expanded', () => {
    expect(readDirExpansion({ expanded: { src: 'yes' } })).toBeUndefined();
    expect(readDirExpansion({ expanded: [] })).toBeUndefined();
  });

  it('rejects a manualCollapsed leaf that is not exactly true', () => {
    expect(readDirExpansion({ expanded: {}, manualCollapsed: { src: false } })).toBeUndefined();
    expect(readDirExpansion({ expanded: {}, manualCollapsed: { src: 1 } })).toBeUndefined();
    expect(readDirExpansion({ expanded: {}, manualCollapsed: [] })).toBeUndefined();
  });

  it('repairs the cross-field conflict in place and keeps every other path', () => {
    // 裁定 2：冲突有唯一正解（expanded[k] === true ⇒ 目录确实展开），因此就地丢弃
    // manualCollapsed[k]，而不是因一处冲突丢掉用户**全部**展开态。
    const result = readDirExpansion({
      expanded: { src: true, docs: false, 'src/a': true },
      manualCollapsed: { src: true, docs: true },
    });
    expect(result?.expanded).toEqual({ src: true, docs: false, 'src/a': true });
    expect(result?.manualCollapsed).toEqual({ docs: true });
  });

  it('drops an emptied manualCollapsed entirely', () => {
    const result = readDirExpansion({ expanded: { src: true }, manualCollapsed: { src: true } });
    expect(result?.expanded).toEqual({ src: true });
    expect(result?.manualCollapsed).toBeUndefined();
  });

  it('rejects arrays and null', () => {
    expect(readDirExpansion([])).toBeUndefined();
    expect(readDirExpansion(null)).toBeUndefined();
    expect(readDirExpansion('src')).toBeUndefined();
  });
});

describe('readStringSet', () => {
  const read = readStringSet(['staged', 'modified', 'untracked'] as const);

  it('keeps legal members and filters out illegal ones', () => {
    const result = read(['staged', 'bogus', 42, 'modified']);
    expect(result).toBeInstanceOf(Set);
    expect([...(result ?? [])].sort()).toEqual(['modified', 'staged']);
  });

  it('rejects non-array input', () => {
    expect(read('staged')).toBeUndefined();
    expect(read({ staged: true })).toBeUndefined();
    expect(read(null)).toBeUndefined();
  });
});

describe('readCiRepoConfig', () => {
  it('accepts a well-formed config and forces accessToken to null', () => {
    expect(
      readCiRepoConfig({
        owner: 'o',
        repo: 'r',
        branch: 'main',
        workflowId: '123',
        accessToken: 'leaked',
      }),
    ).toEqual({
      owner: 'o',
      repo: 'r',
      branch: 'main',
      workflowId: '123',
      accessToken: null,
    });
  });

  it('rejects non-string members and non-objects', () => {
    expect(readCiRepoConfig({ owner: 'o', repo: 'r', branch: 42 })).toBeUndefined();
    expect(readCiRepoConfig(null)).toBeUndefined();
    expect(readCiRepoConfig([])).toBeUndefined();
  });
});

describe('readCiSnapshots', () => {
  it('accepts well-formed snapshots', () => {
    const snapshots = {
      'ws-1': { repo: 'o/r', branch: 'main', jobs: [], capturedAtMs: 1 },
    };
    expect(readCiSnapshots(snapshots)).toEqual(snapshots);
  });

  it('rejects the whole table when any member is malformed', () => {
    expect(readCiSnapshots({ 'ws-1': { repo: 'o/r' } })).toBeUndefined();
    expect(readCiSnapshots([])).toBeUndefined();
  });
});

describe('readCiLogCaches', () => {
  it('accepts well-formed caches', () => {
    const caches = { d1: { selectedJobId: 7, logs: { 7: 'a\n' } } };
    expect(readCiLogCaches(caches)).toEqual(caches);
  });

  it('rejects non-string log lines and non-numeric job ids', () => {
    expect(readCiLogCaches({ d1: { selectedJobId: '7', logs: {} } })).toBeUndefined();
    expect(readCiLogCaches({ d1: { selectedJobId: null, logs: { 1: 42 } } })).toBeUndefined();
  });
});

describe('readGitHubWorkspaceConfigs', () => {
  it('skips members without an owner and keeps the rest (mirrors old hydrate)', () => {
    expect(
      readGitHubWorkspaceConfigs({
        'ws-1': {
          owner: 'o',
          repo: 'r',
          branch: 'dev',
          workflowId: null,
          configured: true,
        },
        'ws-bad': { repo: 'r' },
      }),
    ).toEqual({
      'ws-1': {
        owner: 'o',
        repo: 'r',
        branch: 'dev',
        workflowId: null,
        accessToken: null,
        configured: true,
      },
    });
  });

  it('rejects non-objects', () => {
    expect(readGitHubWorkspaceConfigs(null)).toBeUndefined();
    expect(readGitHubWorkspaceConfigs([])).toBeUndefined();
  });
});

describe('readGitHubCiFolders', () => {
  it('nulls member tokens and skips members without an id', () => {
    expect(
      readGitHubCiFolders([
        { id: 'f1', name: 'a', createdAt: 1, ciConfig: { owner: 'o', accessToken: 's' } },
        { name: 'no-id' },
      ]),
    ).toEqual([{ id: 'f1', name: 'a', createdAt: 1, ciConfig: { owner: 'o', accessToken: null } }]);
  });

  it('rejects non-arrays', () => {
    expect(readGitHubCiFolders({})).toBeUndefined();
  });
});
