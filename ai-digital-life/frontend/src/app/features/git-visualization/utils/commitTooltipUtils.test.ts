import { describe, it, expect } from 'vitest';
import { formatDate, getGravatarUrl, md5 } from './commitTooltipUtils';

describe('md5', () => {
  it('produces correct MD5 hash for known input', () => {
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('handles empty string', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('handles special characters', () => {
    expect(md5('test@example.com')).toBeTruthy();
    expect(md5('test@example.com').length).toBe(32);
  });
});

describe('getGravatarUrl', () => {
  it('generates correct Gravatar URL', () => {
    const md5Hash = md5('alex@example.com');
    expect(getGravatarUrl('alex@example.com', 32)).toBe(
      `https://www.gravatar.com/avatar/${md5Hash}?s=32&d=identicon`,
    );
  });

  it('lowercases and trims email before hashing', () => {
    const url1 = getGravatarUrl('Alex@Example.com', 32);
    const url2 = getGravatarUrl('alex@example.com', 32);
    expect(url1).toBe(url2);
  });

  it('uses default size 80 when not specified', () => {
    const url = getGravatarUrl('test@test.com');
    expect(url).toContain('?s=80');
  });
});

describe('formatDate', () => {
  it('formats in table mode as "HH:mm DD-MM-YYYY"', () => {
    const result = formatDate('2026-07-28T14:30:00', 'en-US', 'table');
    expect(result).toMatch(/^\d{2}:\d{2} \d{2}-\d{2}-\d{4}$/);
  });

  it('formats in tooltip mode with natural date', () => {
    const result = formatDate('2026-07-28T14:30:00', 'en-US', 'tooltip');
    expect(result).toContain('2026');
    expect(result).toContain('28');
  });

  it('falls back gracefully for invalid date', () => {
    const result = formatDate('invalid', 'en-US', 'table');
    expect(result).toBe('--');
  });
});
