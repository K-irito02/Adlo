import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CopyDict } from '@i18n/types';
import { formatRelativeTime } from '../relativeTime';

const t = {
  relativeTimeJustNow: 'Just now',
  relativeTimeMinutesAgo: '{n} min ago',
  relativeTimeHoursAgo: '{n} hr ago',
  relativeTimeDaysAgo: '{n} days ago',
} as unknown as CopyDict;

afterEach(() => {
  vi.useRealTimers();
});

describe('formatRelativeTime', () => {
  it('returns "just now" for timestamps under a minute old', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
    expect(formatRelativeTime(Date.parse('2026-09-16T11:59:30Z'), t)).toBe('Just now');
  });

  it('formats minutes, hours and days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
    expect(formatRelativeTime(Date.parse('2026-09-16T11:55:00Z'), t)).toBe('5 min ago');
    expect(formatRelativeTime(Date.parse('2026-09-16T10:00:00Z'), t)).toBe('2 hr ago');
    expect(formatRelativeTime(Date.parse('2026-09-13T12:00:00Z'), t)).toBe('3 days ago');
  });

  it('returns empty string for future timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
    expect(formatRelativeTime(Date.parse('2026-09-16T12:00:30Z'), t)).toBe('');
  });
});
