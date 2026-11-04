import type { TimeRangeState } from '@stores/slices/gitVisSlice';

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Resolve a relative time-range preset to concrete `since`/`until` date strings
 * anchored at `now` (default: current time). Used both when a preset is first
 * selected and again at every refresh so rolling ranges stay aligned with today.
 */
export function resolveRollingRange(
  preset: 'week' | 'month' | 'year',
  now = new Date(),
): { since: string; until: string } {
  const until = formatLocalDate(now);
  const sinceDate = new Date(now.getTime());
  switch (preset) {
    case 'week':
      sinceDate.setDate(sinceDate.getDate() - 7);
      break;
    case 'month':
    case 'year': {
      const startDay = sinceDate.getDate();
      if (preset === 'month') {
        sinceDate.setMonth(sinceDate.getMonth() - 1);
      } else {
        sinceDate.setFullYear(sinceDate.getFullYear() - 1);
      }
      if (sinceDate.getDate() !== startDay) {
        sinceDate.setDate(0);
      }
      break;
    }
  }
  return { since: formatLocalDate(sinceDate), until };
}

/**
 * Produce the fetch bounds for a stored time-range state. Relative presets
 * (week/month/year) are re-resolved against `now` so a refresh never reuses a
 * stale absolute `until` captured when the preset was first selected.
 */
export function resolveTimeRangeForFetch(
  range: TimeRangeState,
  now = new Date(),
): { since?: string; until?: string } {
  switch (range.preset) {
    case 'custom':
      return { since: range.since, until: range.until };
    case 'all':
      return { since: undefined, until: undefined };
    case 'week':
    case 'month':
    case 'year':
      return resolveRollingRange(range.preset, now);
  }
}
