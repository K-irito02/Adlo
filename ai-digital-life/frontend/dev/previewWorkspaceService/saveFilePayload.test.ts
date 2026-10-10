import { describe, it, expect } from 'vitest';
import { isValidBase64Payload } from './index';

describe('clipboard save-file base64 validation', () => {
  it('accepts canonical base64 (padded and exact multiples)', () => {
    expect(isValidBase64Payload('aGk=')).toBe(true);
    expect(isValidBase64Payload('aGVsbG8=')).toBe(true);
    expect(isValidBase64Payload('+/+/')).toBe(true);
  });

  it('rejects empty and malformed payloads instead of writing garbage', () => {
    expect(isValidBase64Payload('')).toBe(false);
    expect(isValidBase64Payload('not base64!!!')).toBe(false);
    // 无 padding 且长度非 4 倍数：与 Rust STANDARD 对齐拒收（Node 本会宽容解码）
    expect(isValidBase64Payload('aGk')).toBe(false);
    // 长度对不齐（4n+1）不是合法 base64
    expect(isValidBase64Payload('abcde')).toBe(false);
    expect(isValidBase64Payload('a b')).toBe(false);
  });
});
