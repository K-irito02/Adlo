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
  readObjectArray,
  readObjectArrayRecord,
  readSearchUseGitignore,
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
