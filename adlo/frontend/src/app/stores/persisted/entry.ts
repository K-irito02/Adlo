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
  'center',
  'env',
  'update',
] as const;

export type PersistDomain = (typeof PERSIST_DOMAINS)[number];

// 名称段为"以字母开头的单个字母数字 token"（camelCase / PascalCase / 单词）。
// 目的：与遗留前缀的 kebab-case 名称（adl-ui:file-tree-expanded）划清界限，
// 同时拒绝空段、数字开头、下划线/连字符/点号混入。
//
// 说明（Task 9 更正）：本条初稿为 `[A-Za-z][A-Za-z0-9]*`，Task 2 实现时因自身用例
// 要求 `adl:files.lowercase` 返回 null 而收紧为"至少含一个大写字母"。但 Task 9 的
// 登记键表逐字要求 `adl:browser.tabs` / `adl:browser.history` / `adl:browser.bookmarks`
// / `adl:browser.shortcuts` 这四个全小写单词名 —— 与"至少含一个大写"互斥
// （同一字符串不可能同时满足），故恢复为初稿正则，并按计划键表放开全小写单词名。
// 遗留前缀（adl-ui: / adl-terminal: / adl-search:）的拒绝不受影响：它们是域段未匹配。
const KEY_PATTERN =
  /^adl:(?<domain>[a-z]+)\.(?<name>[A-Za-z][A-Za-z0-9]*)(?:\.v(?<version>[0-9]+))?$/;

export interface ParsedPersistKey {
  domain: PersistDomain;
  name: string;
  version: number;
}

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
export interface PruneCtx {
  /** 当前实际存在的工作区 id */
  workspaceIds: ReadonlySet<string>;
  /** 已成功加载过目录树的工作区 → 该工作区的目录相对路径全集；未加载/加载失败的工作区不在表内 */
  loadedDirPaths: ReadonlyMap<string, ReadonlySet<string>>;
  /** 当前实际存在的标签 id */
  tabIds: ReadonlySet<string>;
}

export interface PruneResult<T> {
  value: T;
  changed: boolean;
}

/**
 * 条目基类：所有条目共有的字段。
 *
 * `field` 与 `apply` 的二选一约束见下方 `PersistEntry` 联合类型——
 * 甲类条目水合写入 store 字段，乙类条目（外部模块级微型存储）水合时把
 * 校验后的值交回模块自己的缓存（`apply`），由 `hydrate.ts` 调度。
 */
export interface EntryBase<T> {
  /** 完整键名，须符合 PERSIST_KEY_PATTERN 且全域唯一 */
  key: string;
  /** 无数据 / 解析失败时的兜底值 */
  fallback: T;
  scope: PersistScope;
  /** 形状与取值校验；返回 undefined 表示不合法，将退回 fallback */
  read?: (raw: unknown) => T | undefined;
  /** 引用是否仍存在；参照清单为空时必须返回 { value, changed: false } */
  prune?: (value: T, ctx: PruneCtx) => PruneResult<T>;
  /** 是否允许构造期同步读取；默认 true（大对象必须显式设为 false） */
  sync?: boolean;
}

export type PersistEntry<T> = EntryBase<T> &
  (
    | {
        /** 水合后写入的 store 字段名。全局唯一 —— 同一字段不得由两条键声明（结构性防止重复定义） */
        field: keyof StoreState;
        apply?: never;
      }
    | {
        /** 水合目标为模块级微型存储：把校验后的值交回其缓存（不写入 store 字段） */
        field?: never;
        apply: (value: T) => void;
      }
  );

export function defineEntry<T>(entry: PersistEntry<T>): PersistEntry<T> {
  return entry;
}

/** 校验 Record<string, boolean>；键为字符串、值为布尔，否则整体判为不合法 */
export function readBooleanRecord(raw: unknown): Record<string, boolean> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'boolean') {
      return undefined;
    }
    result[key] = value;
  }
  return result;
}
