import { describe, it, expect } from 'vitest';
import { formatDate, generatePixelAvatar, resolveAvatarUrl, md5 } from './commitTooltipUtils';

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

describe('resolveAvatarUrl', () => {
  it('generates correct Gravatar URL with retro fallback', () => {
    const md5Hash = md5('alex@example.com');
    expect(resolveAvatarUrl('alex@example.com', 32)).toBe(
      `https://www.gravatar.com/avatar/${md5Hash}?s=32&d=retro`,
    );
  });

  it('lowercases and trims email before hashing', () => {
    const url1 = resolveAvatarUrl('Alex@Example.com', 32);
    const url2 = resolveAvatarUrl('alex@example.com', 32);
    expect(url1).toBe(url2);
  });

  it('uses default size 80 when not specified', () => {
    const url = resolveAvatarUrl('test@test.com');
    expect(url).toContain('?s=80');
  });

  it('detects GitHub noreply email and uses github.com URL', () => {
    const url = resolveAvatarUrl('alex@users.noreply.github.com', 32);
    expect(url).toBe('https://github.com/alex.png');
  });

  it('extracts username from noreply email with userid+username format', () => {
    const url = resolveAvatarUrl('12345+alex@users.noreply.github.com', 32);
    expect(url).toBe('https://github.com/alex.png');
  });

  it('uses Gravatar for non-noreply emails with retro fallback', () => {
    const url = resolveAvatarUrl('alex@example.com', 32);
    expect(url).toContain('gravatar.com/avatar');
    expect(url).toContain('d=retro');
    expect(url).toContain('s=32');
  });
});

describe('generatePixelAvatar', () => {
  it('returns a data URI with SVG content', () => {
    const result = generatePixelAvatar('alex@example.com', 20);
    expect(result.startsWith('data:image/svg+xml,')).toBe(true);
  });

  it('produces deterministic output for the same email', () => {
    const a = generatePixelAvatar('alex@example.com', 20);
    const b = generatePixelAvatar('alex@example.com', 20);
    expect(a).toBe(b);
  });

  it('produces different output for different emails', () => {
    const a = generatePixelAvatar('alex@example.com', 20);
    const b = generatePixelAvatar('bob@example.com', 20);
    expect(a).not.toBe(b);
  });

  it('is case-insensitive and trims whitespace (matches gravatar semantics)', () => {
    const a = generatePixelAvatar('Alex@Example.com ', 20);
    const b = generatePixelAvatar('alex@example.com', 20);
    expect(a).toBe(b);
  });

  it('handles empty email without throwing', () => {
    expect(() => generatePixelAvatar('', 20)).not.toThrow();
    expect(() => generatePixelAvatar('   ', 20)).not.toThrow();
  });

  it('handles undefined email without throwing', () => {
    expect(() => generatePixelAvatar(undefined as unknown as string, 20)).not.toThrow();
  });

  it('embeds the requested size in the SVG', () => {
    const result = decodeURIComponent(generatePixelAvatar('alex@example.com', 32));
    expect(result).toContain('width="32"');
    expect(result).toContain('height="32"');
  });

  it('uses default size 20 when not specified', () => {
    const result = decodeURIComponent(generatePixelAvatar('alex@example.com'));
    expect(result).toContain('width="20"');
  });

  it('always returns a non-empty string', () => {
    expect(generatePixelAvatar('alex@example.com', 20).length).toBeGreaterThan(0);
    expect(generatePixelAvatar('', 20).length).toBeGreaterThan(0);
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
