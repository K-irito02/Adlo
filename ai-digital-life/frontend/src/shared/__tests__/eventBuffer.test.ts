import { describe, it, expect, vi } from 'vitest';
import { EventBuffer } from '../eventBuffer';

describe('EventBuffer', () => {
  it('collects pushed events and flushes them', () => {
    const buffer = new EventBuffer<string>();
    buffer.push('a');
    buffer.push('b');
    buffer.push('c');
    const flushed = buffer.flush();
    expect(flushed).toEqual(['a', 'b', 'c']);
  });

  it('flush clears the buffer', () => {
    const buffer = new EventBuffer<string>();
    buffer.push('x');
    buffer.flush();
    const second = buffer.flush();
    expect(second).toEqual([]);
  });

  it('drainWithReconciliation merges duplicates by key', () => {
    const buffer = new EventBuffer<{ id: string; value: string }>();
    buffer.push({ id: '1', value: 'first' });
    buffer.push({ id: '2', value: 'alpha' });
    buffer.push({ id: '1', value: 'second' });
    buffer.push({ id: '2', value: 'beta' });
    const merged = buffer.drainWithReconciliation(
      (e) => e.id,
      (_prev, next) => next,
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.id === '1')!.value).toBe('second');
    expect(merged.find((e) => e.id === '2')!.value).toBe('beta');
  });

  it('drainWithReconciliation preserves non-duplicate entries', () => {
    const buffer = new EventBuffer<{ id: string; value: number }>();
    buffer.push({ id: 'a', value: 1 });
    buffer.push({ id: 'b', value: 2 });
    buffer.push({ id: 'a', value: 3 });
    const merged = buffer.drainWithReconciliation(
      (e) => e.id,
      (prev, next) => ({ id: prev.id, value: prev.value + next.value }),
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.id === 'a')!.value).toBe(4);
    expect(merged.find((e) => e.id === 'b')!.value).toBe(2);
  });

  it('scheduleFlush calls flush via microtask then invokes callback', async () => {
    const buffer = new EventBuffer<string>();
    const callback = vi.fn();
    buffer.push('event1');
    buffer.push('event2');
    buffer.scheduleFlush(callback);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callback).toHaveBeenCalledWith(['event1', 'event2']);
  });
});
