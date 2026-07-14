import { describe, expect, it } from 'vitest';
import { historyDedupKey } from './browserDisplayUtils';

describe('historyDedupKey', () => {
  it('produces different keys for different query strings (the bug being fixed)', () => {
    expect(historyDedupKey('https://youtube.com/watch?v=AAA')).not.toBe(
      historyDedupKey('https://youtube.com/watch?v=BBB')
    );
  });

  it('produces the same key for the same URL (stability)', () => {
    expect(historyDedupKey('https://example.com/page')).toBe(
      historyDedupKey('https://example.com/page')
    );
  });

  it('ignores the hash fragment', () => {
    expect(historyDedupKey('https://example.com/page#hash')).toBe(
      historyDedupKey('https://example.com/page')
    );
  });

  it('falls back to the raw input for invalid URLs', () => {
    expect(historyDedupKey('invalid-url')).toBe('invalid-url');
  });

  it('strips the www. prefix', () => {
    expect(historyDedupKey('https://www.example.com/page')).toBe(
      historyDedupKey('https://example.com/page')
    );
  });

  it('includes the query string in the returned key', () => {
    expect(historyDedupKey('https://youtube.com/watch?v=AAA')).toBe('youtube.com/watch?v=AAA');
  });

  it('strips trailing slash from non-root paths', () => {
    expect(historyDedupKey('https://example.com/page/')).toBe(
      historyDedupKey('https://example.com/page')
    );
  });

  it('preserves the root path slash', () => {
    expect(historyDedupKey('https://example.com/')).toBe('example.com/');
  });
});
