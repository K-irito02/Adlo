import { describe, expect, it, beforeEach } from 'vitest';
import {
  createDebouncedWrite,
  flushCrossSliceWrites,
  makePersistedWriter,
  readJson,
} from '../storageHelpers';

describe('createDebouncedWrite flush', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('flush 同步落盘 pending 写入（关闭路径不再丢失去抖中的数据）', () => {
    const { scheduleWrite, flush } = createDebouncedWrite(50);
    scheduleWrite('k1', { a: 1 });
    expect(window.localStorage.getItem('k1')).toBeNull();
    flush();
    expect(readJson('k1', {})).toEqual({ a: 1 });
  });

  it('flushCrossSliceWrites 落盘 makePersistedWriter 的 pending 写入', () => {
    const write = makePersistedWriter('k2');
    write({ b: 2 });
    expect(window.localStorage.getItem('k2')).toBeNull();
    flushCrossSliceWrites();
    expect(readJson('k2', {})).toEqual({ b: 2 });
  });
});
