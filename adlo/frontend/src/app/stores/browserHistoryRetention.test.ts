import { describe, it, expect } from 'vitest';
import {
  HISTORY_MAX_ENTRIES,
  HISTORY_RETENTION_MS,
  pruneBrowserHistory,
} from './browserHistoryRetention';
import type { BrowserHistoryState } from './slices/browserTypes';
import { registry } from './persisted/registry';

function entry(id: string, visitedAt: number): BrowserHistoryState {
  return { id, url: `https://example.com/${id}`, title: id, visitedAt };
}

describe('pruneBrowserHistory', () => {
  const now = 1_800_000_000_000;

  it('drops entries older than the 180-day window', () => {
    const kept = pruneBrowserHistory(
      [entry('recent', now - 10), entry('old', now - HISTORY_RETENTION_MS - 1)],
      now,
    );
    expect(kept.map((h) => h.id)).toEqual(['recent']);
  });

  it('keeps at most 1000 entries in the given (newest-first) order', () => {
    const history = Array.from({ length: HISTORY_MAX_ENTRIES + 5 }, (_, i) =>
      entry(`h-${i}`, now - i),
    );
    const kept = pruneBrowserHistory(history, now);
    expect(kept).toHaveLength(HISTORY_MAX_ENTRIES);
    expect(kept[0]!.id).toBe('h-0');
    expect(kept[kept.length - 1]!.id).toBe(`h-${HISTORY_MAX_ENTRIES - 1}`);
  });

  it('does not mutate the input array', () => {
    const history = [entry('a', now), entry('b', now - 1)];
    const snapshot = [...history];
    pruneBrowserHistory(history, now);
    expect(history).toEqual(snapshot);
  });
});

describe('adl:browser.history read-side retention', () => {
  it('applies the same 1000-entry / 180-day policy when reading persisted data', () => {
    const now = Date.now();
    const raw = [
      ...Array.from({ length: HISTORY_MAX_ENTRIES + 20 }, (_, i) => entry(`recent-${i}`, now - i)),
      entry('expired', now - HISTORY_RETENTION_MS - 1),
    ];

    const read = registry['adl:browser.history'].read?.(raw);

    expect(read).toHaveLength(HISTORY_MAX_ENTRIES);
    expect(read?.some((item) => item.id === 'expired')).toBe(false);
  });
});
