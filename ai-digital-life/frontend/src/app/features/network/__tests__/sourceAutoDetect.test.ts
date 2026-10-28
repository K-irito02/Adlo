import { describe, expect, it } from 'vitest';
import { pickFastestSource } from '../sourceAutoDetect';

describe('pickFastestSource', () => {
  it('returns null when nothing is reachable', () => {
    expect(pickFastestSource([null, { reachable: false, latency_ms: 1 }])).toBeNull();
  });

  it('picks the lowest latency among reachable candidates', () => {
    const winner = pickFastestSource([
      { url: 'a', reachable: true, latency_ms: 80 },
      { url: 'b', reachable: true, latency_ms: 20 },
      { url: 'c', reachable: false, latency_ms: 1 },
    ]);
    expect(winner?.url).toBe('b');
  });

  it('treats missing latency as worst but still selectable', () => {
    const winner = pickFastestSource([
      { url: 'a', reachable: true, latency_ms: null },
      { url: 'b', reachable: true, latency_ms: 500 },
    ]);
    expect(winner?.url).toBe('b');
  });
});
