import { expect } from 'vitest';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { resetHydrationForTest } from '../hydrate';
import { resetWriteFailureWarning } from '@stores/storageHelpers';
import type { RegistryKey, RegistryValue } from '../registry';

/** 清空存储并重置模块级缓存，模拟"全新启动" */
export function stubStorage(): void {
  localStorage.clear();
  resetHydrationForTest();
  resetWriteFailureWarning();
}

/**
 * 断言"写入 → 模拟重启 → 读回一致"。
 *
 * @param key 登记键
 * @param write 触发写入的动作（内部应调用 persist 或经其封装的 setter）
 * @param readAfterRestart 重启后读取该状态的函数（内部应调用 hydrateAll）
 * @param value 期望还原的值
 */
export function expectPersistsAcrossRestart<K extends RegistryKey>(
  key: K,
  write: (value: RegistryValue<K>) => void,
  readAfterRestart: () => unknown,
  value: RegistryValue<K>,
): void {
  write(value);
  flushCrossSliceWrites();
  expect(localStorage.getItem(key), `expected ${key} to be written`).not.toBeNull();

  resetHydrationForTest();
  expect(readAfterRestart()).toEqual(value);
}
