import { describe, expect, it } from 'vitest';
import { historyDedupKey } from './browserDisplayUtils';

describe('historyDedupKey', () => {
  it('produces different keys for different query strings (the bug being fixed)', () => {
    expect(historyDedupKey('https://youtube.com/watch?v=AAA')).not.toBe(
      historyDedupKey('https://youtube.com/watch?v=BBB'),
    );
  });

  it('produces the same key for the same URL (stability)', () => {
    expect(historyDedupKey('https://example.com/page')).toBe(
      historyDedupKey('https://example.com/page'),
    );
  });

  it('ignores the hash fragment', () => {
    expect(historyDedupKey('https://example.com/page#hash')).toBe(
      historyDedupKey('https://example.com/page'),
    );
  });

  it('falls back to the raw input for invalid URLs', () => {
    expect(historyDedupKey('invalid-url')).toBe('invalid-url');
  });

  it('strips the www. prefix', () => {
    expect(historyDedupKey('https://www.example.com/page')).toBe(
      historyDedupKey('https://example.com/page'),
    );
  });

  it('includes the query string in the returned key', () => {
    expect(historyDedupKey('https://youtube.com/watch?v=AAA')).toBe('youtube.com/watch?v=AAA');
  });

  it('strips trailing slash from non-root paths', () => {
    expect(historyDedupKey('https://example.com/page/')).toBe(
      historyDedupKey('https://example.com/page'),
    );
  });

  it('preserves the root path slash', () => {
    expect(historyDedupKey('https://example.com/')).toBe('example.com/');
  });

  it('strips known tracking params (Bilibili vd_source) so variants collapse', () => {
    expect(historyDedupKey('https://www.bilibili.com/video/BV1eSGP6BEfn')).toBe(
      historyDedupKey('https://www.bilibili.com/video/BV1eSGP6BEfn?vd_source=f2043'),
    );
    expect(historyDedupKey('https://www.bilibili.com/video/BV1eSGP6BEfn?vd_source=f2043')).toBe(
      'bilibili.com/video/BV1eSGP6BEfn',
    );
  });

  it('strips multiple tracking params (vd_source, spm_id_from, trackid)', () => {
    const withTrackers =
      'https://www.bilibili.com/video/BV1W9enziEGi?spm_id_from=333.788.recommend_more_video.0&trackid=web_related_0.router-related-2479604&vd_source=f204375acc1';
    const without = 'https://www.bilibili.com/video/BV1W9enziEGi';
    expect(historyDedupKey(withTrackers)).toBe(historyDedupKey(without));
    expect(historyDedupKey(withTrackers)).toBe('bilibili.com/video/BV1W9enziEGi');
  });

  it('sorts remaining query params so reordered variants collapse', () => {
    expect(historyDedupKey('https://example.com/video?b=2&a=1')).toBe(
      historyDedupKey('https://example.com/video?a=1&b=2'),
    );
  });

  it('keeps meaningful query params (YouTube v) distinct', () => {
    expect(historyDedupKey('https://youtube.com/watch?v=AAA')).not.toBe(
      historyDedupKey('https://youtube.com/watch?v=BBB'),
    );
  });

  it('keeps meaningful params when tracking params are also present', () => {
    expect(historyDedupKey('https://youtube.com/watch?v=AAA&utm_source=x')).toBe(
      'youtube.com/watch?v=AAA',
    );
  });

  it('strips UTM and ad click params', () => {
    expect(
      historyDedupKey(
        'https://example.com/page?utm_source=news&utm_medium=email&utm_campaign=launch&gclid=abc',
      ),
    ).toBe('example.com/page');
  });

  it('collapses YouTube radio churn (start_radio + auto-generated list=RD queue)', () => {
    const withRadio = 'https://youtube.com/watch?v=AAA&list=RDR0di5GVDKMU&start_radio=1';
    const withoutRadio = 'https://youtube.com/watch?v=AAA';
    expect(historyDedupKey(withRadio)).toBe(historyDedupKey(withoutRadio));
    expect(historyDedupKey(withRadio)).toBe('youtube.com/watch?v=AAA');
  });

  it('collapses YouTube radio queue-progress markers (pp / index) in radio mode', () => {
    const entry = 'https://youtube.com/watch?v=AAA&list=RDGwoY5ooF8oQ&start_radio=1';
    const withPp = 'https://youtube.com/watch?v=AAA&list=RDGwoY5ooF8oQ&start_radio=1&pp=oAcB';
    const withIndex = 'https://youtube.com/watch?v=AAA&list=RDGwoY5ooF8oQ&index=8';
    expect(historyDedupKey(withPp)).toBe(historyDedupKey(entry));
    expect(historyDedupKey(withIndex)).toBe(historyDedupKey(entry));
    expect(historyDedupKey(withPp)).toBe('youtube.com/watch?v=AAA');
  });

  it('keeps a real user playlist (list=PL...) as part of the identity', () => {
    const playlist = 'https://youtube.com/watch?v=AAA&list=PLabc123';
    expect(historyDedupKey(playlist)).toBe('youtube.com/watch?list=PLabc123&v=AAA');
  });

  it('keeps index for a real playlist (not radio)', () => {
    const playlist = 'https://youtube.com/watch?v=AAA&list=PLabc123&index=2';
    expect(historyDedupKey(playlist)).toBe('youtube.com/watch?index=2&list=PLabc123&v=AAA');
  });

  it('keeps different radio videos distinct (v is still identity)', () => {
    const a = 'https://youtube.com/watch?v=AAA&list=RDR0di5GVDKMU&start_radio=1';
    const b = 'https://youtube.com/watch?v=BBB&list=RDR0di5GVDKMU&start_radio=1';
    expect(historyDedupKey(a)).not.toBe(historyDedupKey(b));
  });
});
