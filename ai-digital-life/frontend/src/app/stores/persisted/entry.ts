import type { StoreState } from '../StoreState';

export type PersistScope = 'global' | 'byWorkspaceId' | 'byTabId';

export const PERSIST_DOMAINS = [
  'ui',
  'files',
  'changes',
  'browser',
  'terminal',
  'search',
  'session',
] as const;

export type PersistDomain = (typeof PERSIST_DOMAINS)[number];

// name 必须是 camelCase/PascalCase（至少包含一个大写字母），纯小写视为非法键。
// 注意：真实键名如 workspaceExpanded 以小写开头，但含大写字母，须能被解析；
// 而 tests 中 adl:files.lowercase（纯小写）必须被拒绝。
const KEY_PATTERN =
  /^adl:(?<domain>[a-z]+)\.(?<name>[A-Za-z0-9]*[A-Z][A-Za-z0-9]*)(?:\.v(?<version>[0-9]+))?$/;

export type ParsedPersistKey = {
  domain: PersistDomain;
  name: string;
  version: number;
};

export function isPersistDomain(value: string): value is PersistDomain {
  return (PERSIST_DOMAINS as readonly string[]).includes(value);
}

export function parsePersistKey(key: string): ParsedPersistKey | null {
  const matched = KEY_PATTERN.exec(key);
  const groups = matched?.groups;
  if (!groups) {
    return null;
  }
  const domain = groups.domain;
  if (!isPersistDomain(domain)) {
    return null;
  }
  return {
    domain,
    name: groups.name,
    version: groups.version ? Number(groups.version) : 1,
  };
}

/**
 * 剪枝参照清单。
 *
 * 安全不变量：任何一个字段为空集合/空表时，对应的剪枝必须跳过 ——
 * 详见规格 §3.5.1 首要安全规则（在 store 构造期工作区列表尚为空，
 * 此时按存在性剪枝会误删全部按工作区隔离的状态）。
 */
export type PruneCtx = {
  /** 当前实际存在的工作区 id */
  workspaceIds: ReadonlySet<string>;
  /** 已成功加载过目录树的工作区 → 该工作区的目录相对路径全集；未加载/加载失败的工作区不在表内 */
  loadedDirPaths: ReadonlyMap<string, ReadonlySet<string>>;
  /** 当前实际存在的标签 id */
  tabIds: ReadonlySet<string>;
};

export type PruneResult<T> = { value: T; changed: boolean };

export type PersistEntry<T> = {
  /** 完整键名，须符合 PERSIST_KEY_PATTERN 且全域唯一 */
  key: string;
  /** 水合后写入的 store 字段名。全局唯一 —— 同一字段不得由两条键声明（结构性防止重复定义） */
  field: keyof StoreState;
  /** 无数据 / 解析失败时的兜底值 */
  fallback: T;
  scope: PersistScope;
  /** 形状与取值校验；返回 undefined 表示不合法，将退回 fallback */
  read?: (raw: unknown) => T | undefined;
  /** 引用是否仍存在；参照清单为空时必须返回 { value, changed: false } */
  prune?: (value: T, ctx: PruneCtx) => PruneResult<T>;
  /** 是否允许构造期同步读取；默认 true（大对象必须显式设为 false） */
  sync?: boolean;
};

export function defineEntry<T>(entry: PersistEntry<T>): PersistEntry<T> {
  return entry;
}
