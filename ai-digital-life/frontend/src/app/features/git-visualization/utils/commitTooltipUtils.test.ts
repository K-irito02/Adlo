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
  it('generates correct Gravatar URL with retro fallback', () => {
    // user+tag bypasses github-guess (+ not in [a-zA-Z0-9_-])
    const md5Hash = md5('user+tag@example.com');
    expect(getGravatarUrl('user+tag@example.com', 32)).toBe(
      `https://www.gravatar.com/avatar/${md5Hash}?s=32&d=retro`,
    );
  });

  it('lowercases and trims email before hashing', () => {
    const url1 = getGravatarUrl('user+tag@Example.com', 32);
    const url2 = getGravatarUrl('user+tag@example.com', 32);
    expect(url1).toBe(url2);
  });

  it('uses default size 80 when not specified', () => {
    // user+tag bypasses github-guess
    const url = getGravatarUrl('user+tag@test.com');
    expect(url).toContain('?s=80');
  });

  it('detects GitHub noreply email and uses github.com URL', () => {
    const url = getGravatarUrl('alex@users.noreply.github.com', 32);
    expect(url).toBe('https://github.com/alex.png');
  });

  it('extracts username from noreply email with userid+username format', () => {
    const url = getGravatarUrl('12345+alex@users.noreply.github.com', 32);
    expect(url).toBe('https://github.com/alex.png');
  });

  it('guesses GitHub username from email local part', () => {
    const url = getGravatarUrl('alex@example.com', 32);
    expect(url).toBe('https://github.com/alex.png');
  });

  it('skips github guess for non-alphanumeric local parts', () => {
    const url = getGravatarUrl('alex.johnson@example.com', 32);
    expect(url).toContain('gravatar.com/avatar');
    expect(url).toContain('d=retro');
  });

  it('skips github guess for too-short local parts', () => {
    const url = getGravatarUrl('a@example.com', 32);
    expect(url).toContain('gravatar.com/avatar');
    expect(url).toContain('d=retro');
  });

  it('uses Gravatar for non-noreply emails with retro fallback', () => {
    const url = getGravatarUrl('user+tag@example.com', 32);
    expect(url).toContain('gravatar.com/avatar');
    expect(url).toContain('d=retro');
    expect(url).toContain('s=32');
  });
});

describe('formatDate', () => {
  it('formats in table mode as "HH:mm DD-MM-YYYY"', () => {
    const result = formatDate('2026-07-28T14:30:00', 'en-US', 'table');
    expect(result).toBe('14:30 28-07-2026');
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
