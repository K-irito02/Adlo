import { describe, expect, it } from 'vitest';
import { clipboardTextStats } from '../clipboardTextStats';

describe('clipboardTextStats', () => {
  it('counts chars, chars without spaces and lines', () => {
    expect(clipboardTextStats('ab cd\n中文')).toEqual({ chars: 8, charsNoSpace: 6, lines: 2 });
  });
  it('treats empty string as zero lines', () => {
    expect(clipboardTextStats('')).toEqual({ chars: 0, charsNoSpace: 0, lines: 0 });
  });
});
