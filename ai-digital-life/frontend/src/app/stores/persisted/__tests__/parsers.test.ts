import { describe, it, expect } from 'vitest';
import { readFlag, readNumberInRange, readStringEnum, readBooleanPropRecord } from '../parsers';

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
