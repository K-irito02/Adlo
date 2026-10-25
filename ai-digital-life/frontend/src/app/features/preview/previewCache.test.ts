import { describe, expect, it } from 'vitest';
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

  it('keys include workspace, size and mtime so edits miss the cache', () => {
    const base = { path: 'a.docx', size: 10, lastModifiedAt: 100 };
    const key = buildPreviewCacheKey('ws-1', base);
    expect(key).toContain('ws-1::a.docx::10::100');
    expect(buildPreviewCacheKey('ws-1', { ...base, size: 11 })).not.toBe(key);
    expect(buildPreviewCacheKey('ws-1', { ...base, lastModifiedAt: 101 })).not.toBe(key);
    expect(buildPreviewCacheKey('ws-2', base)).not.toBe(key);
    expect(buildPreviewCacheKey(undefined, base)).toContain('::a.docx::10::100');
  });
});
