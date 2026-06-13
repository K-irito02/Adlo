import { describe, expect, it } from 'vitest';
import { formatRelativeTime, statusClass } from './githubPanelUtils';

describe('formatRelativeTime', () => {
  it('returns "刚刚" for recent timestamps', () => {
    const result = formatRelativeTime(new Date().toISOString());
    expect(result).toBe('刚刚');
  });

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('5 分钟前');
  });

  it('returns hours ago', () => {
    const twoHourAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHourAgo)).toBe('2 小时前');
  });

  it('returns days ago', () => {
    const threeDayAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeDayAgo)).toBe('3 天前');
  });

  it('returns "—" for null', () => {
    expect(formatRelativeTime(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(formatRelativeTime(undefined)).toBe('—');
  });
});

describe('statusClass', () => {
  it('returns "is-success" for success conclusion', () => {
    expect(statusClass('success', 'completed')).toBe('is-success');
  });

  it('returns "is-failure" for failure conclusion', () => {
    expect(statusClass('failure', 'completed')).toBe('is-failure');
  });

  it('returns "is-failure" for cancelled', () => {
    expect(statusClass('cancelled', 'completed')).toBe('is-failure');
  });

  it('returns "is-skipped" for skipped', () => {
    expect(statusClass('skipped', 'completed')).toBe('is-skipped');
  });

  it('returns "is-running" for in_progress status', () => {
    expect(statusClass(null, 'in_progress')).toBe('is-running');
  });

  it('returns "is-running" for queued status', () => {
    expect(statusClass(null, 'queued')).toBe('is-running');
  });

  it('returns "is-pending" for other statuses with null conclusion', () => {
    expect(statusClass(null, 'pending')).toBe('is-pending');
  });
});
