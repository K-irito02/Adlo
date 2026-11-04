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

  it('flushCrossSliceWrites 覆盖各 slice 自己的去抖实例（不只共享调度器）', () => {
    // 部分 slice（如 GitHub 快照/日志缓存）用独立去抖实例，关闭路径必须一并落盘
    const { scheduleWrite } = createDebouncedWrite(300);
    scheduleWrite('k3', { c: 3 });
    expect(window.localStorage.getItem('k3')).toBeNull();
    flushCrossSliceWrites();
    expect(readJson('k3', {})).toEqual({ c: 3 });
  });
});
