import { describe, expect, it, vi } from 'vitest';
import { buildPreviewCacheKey, createLruCache } from './previewCache';

describe('previewCache', () => {
  it('evicts the least recently used entry', () => {
    const cache = createLruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    // 触碰 a → b 变成最久未使用
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('honors a weight budget (office HTML can be tens of MB)', () => {
    const cache = createLruCache<string>({
      limit: 10,
      weigh: (value) => value.length,
      maxWeight: 10,
    });
    cache.set('a', 'x'.repeat(6));
    cache.set('b', 'y'.repeat(6));
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(1);
  });

  it('calls onEvict for evicted values (pdf.js destroy hook)', () => {
    const onEvict = vi.fn();
    const cache = createLruCache<string>({ limit: 1, onEvict });
    cache.set('a', 'first');
    cache.set('b', 'second');
    expect(onEvict).toHaveBeenCalledWith('first');
  });

  it('rejects a single overweight value instead of wiping the cache', () => {
    const cache = createLruCache<string>({
      limit: 10,
      weigh: (value) => value.length,
      maxWeight: 10,
    });
    cache.set('small', 'x'.repeat(4));
    cache.set('huge', 'y'.repeat(50));
    expect(cache.get('small')).toBe('x'.repeat(4));
    expect(cache.get('huge')).toBeUndefined();
  });

  it('does not evict (destroy) a value when the same key is replaced', () => {
    const onEvict = vi.fn();
    const cache = createLruCache<string>({ limit: 2, onEvict });
    cache.set('a', 'first');
    cache.set('a', 'second');
    expect(onEvict).not.toHaveBeenCalled();
    expect(cache.get('a')).toBe('second');
  });

  it('never grows when the limit is not a finite number', () => {
    const cache = createLruCache<number>({ limit: Number.NaN });
    cache.set('a', 1);
    expect(cache.size).toBe(0);
  });

  it('keys include workspace, size and mtime so edits miss the cache', () => {
    const base = { path: 'a.docx', size: 10, lastModifiedAt: 100 };
    const key = buildPreviewCacheKey('ws-1', base);
    expect(key).toBe(JSON.stringify(['ws-1', 'a.docx', 10, 100]));
    expect(buildPreviewCacheKey('ws-1', { ...base, size: 11 })).not.toBe(key);
    expect(buildPreviewCacheKey('ws-1', { ...base, lastModifiedAt: 101 })).not.toBe(key);
    expect(buildPreviewCacheKey('ws-2', base)).not.toBe(key);
    // 分隔符不再靠 `::` 拼接：路径里带 :: 也不会与另一个字段串味
    expect(buildPreviewCacheKey('ws', { ...base, path: 'a::b' })).not.toBe(
      buildPreviewCacheKey('ws::a', { ...base, path: 'b' }),
    );
  });
});
