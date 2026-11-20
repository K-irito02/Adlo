import { describe, expect, it } from 'vitest';
import { parseSingleRange } from './mediaStream';

describe('parseSingleRange（浏览器模式媒体端点）', () => {
  it('returns undefined when no Range header is present', () => {
    expect(parseSingleRange(undefined, 100)).toBeUndefined();
    expect(parseSingleRange('', 100)).toBeUndefined();
    expect(parseSingleRange('items=0-1', 100)).toBeUndefined();
  });

  it('parses closed, open-ended and suffix ranges', () => {
    expect(parseSingleRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseSingleRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseSingleRange('bytes=-5', 100)).toEqual({ start: 95, end: 99 });
    // 尾端越界按文件末尾裁剪（RFC 7233 §2.1）。
    expect(parseSingleRange('bytes=95-500', 100)).toEqual({ start: 95, end: 99 });
    // 多段请求按首段降级（播放器只发单段）。
    expect(parseSingleRange('bytes=0-9,20-29', 100)).toEqual({ start: 0, end: 9 });
  });

  it('returns null for unsatisfiable ranges (416)', () => {
    expect(parseSingleRange('bytes=100-120', 100)).toBeNull();
    expect(parseSingleRange('bytes=20-10', 100)).toBeNull();
    expect(parseSingleRange('bytes=-0', 100)).toBeNull();
    expect(parseSingleRange('bytes=0-9', 0)).toBeNull();
  });
});
