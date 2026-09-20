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
