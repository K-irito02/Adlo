import { describe, expect, it } from 'vitest';
import { formatClipboardBytes } from '../clipboardBytes';

describe('formatClipboardBytes', () => {
  it('keeps sub-kilobyte values in bytes', () => {
    expect(formatClipboardBytes(0)).toBe('0 B');
    expect(formatClipboardBytes(512)).toBe('512 B');
    expect(formatClipboardBytes(1023)).toBe('1023 B');
  });

  it('scales to KB/MB/GB with one decimal', () => {
    expect(formatClipboardBytes(1024)).toBe('1.0 KB');
    expect(formatClipboardBytes(1536)).toBe('1.5 KB');
    expect(formatClipboardBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatClipboardBytes(1024 ** 3)).toBe('1.0 GB');
  });

  it('returns an empty string for unknown/invalid sizes', () => {
    expect(formatClipboardBytes(-1)).toBe('');
    expect(formatClipboardBytes(Number.NaN)).toBe('');
    expect(formatClipboardBytes(Number.POSITIVE_INFINITY)).toBe('');
  });
});
