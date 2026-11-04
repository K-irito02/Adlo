import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/harness-version-status.json';
import type { DshVersionStatus } from '../dsh';

/**
 * 跨语言契约：共享夹具同时被 Rust `VersionStatus` 序列化测试与这里消费。
 * 夹具赋值给 `DshVersionStatus` 会在编译期暴露缺失字段；键名清单锁定 camelCase。
 */
const typed: DshVersionStatus = fixture;

const EXPECTED_KEYS = [
  'currentSelected',
  'installed',
  'latestAvailable',
  'hasUpdate',
  'prereleaseAvailable',
  'hasPrereleaseUpdate',
  'prereleaseUnknown',
] as const;

describe('harness version status contract', () => {
  it('serializes exactly the shared camelCase keys', () => {
    expect(Object.keys(fixture).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('accepts the shared fixture as DshVersionStatus', () => {
    expect(typed.currentSelected).toBe('1.19.5');
    expect(typed.installed).toEqual(['1.19.5']);
    expect(typed.hasUpdate).toBe(false);
    expect(typed.prereleaseUnknown).toBe(false);
  });
});
