import type { StoreState } from '../StoreState';
import { persist } from './persist';
import { registry, type RegistryKey, type RegistryValue } from './registry';

/**
 * 落盘一个已登记的字段，并返回可直接交给 zustand set 的补丁。
 *
 * 用法：set((state) => persistField('adl:files.workspaceExpanded', next))
 *
 * 之所以需要这个 helper：字段名来自登记表而非调用方手写，因此不存在
 * "写盘用了 A 字段、set 用了 B 字段"这类错配；同时消灭各 slice 中
 * "先写盘、再手动拼 { fieldName: next }"的重复样板。
 */
export function persistField<K extends RegistryKey>(
  key: K,
  value: RegistryValue<K>,
): Partial<StoreState> {
  persist(key, value);
  const field = registry[key].field as string;
  return { [field]: value } as Partial<StoreState>;
}
