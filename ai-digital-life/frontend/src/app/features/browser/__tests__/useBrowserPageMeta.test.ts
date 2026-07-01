import { describe, it, expect } from 'vitest';

describe('meta source priority', () => {
  it('should allow higher priority to overwrite lower priority within TTL', () => {
    const processed = new Map<string, { timestamp: number; source: string }>();
    const TTL = 2000;
    const PRIORITY = { com: 4, iframe: 3, http: 2, google: 1 };

    function shouldProcess(url: string, source: string): boolean {
      const entry = processed.get(url);
      if (!entry) return true;
      if (Date.now() - entry.timestamp > TTL) {
        processed.delete(url);
        return true;
      }
      return PRIORITY[source as keyof typeof PRIORITY] > PRIORITY[entry.source as keyof typeof PRIORITY];
    }

    expect(shouldProcess('https://example.com', 'http')).toBe(true);
    processed.set('https://example.com', { timestamp: Date.now(), source: 'http' });

    expect(shouldProcess('https://example.com', 'com')).toBe(true);

    processed.set('https://example.com', { timestamp: Date.now(), source: 'com' });
    expect(shouldProcess('https://example.com', 'google')).toBe(false);
    expect(shouldProcess('https://example.com', 'http')).toBe(false);
    expect(shouldProcess('https://example.com', 'iframe')).toBe(false);
  });

  it('should allow same priority to overwrite after TTL expiry', async () => {
    const processed = new Map<string, { timestamp: number; source: string }>();
    const TTL = 50;
    const PRIORITY = { com: 4, iframe: 3, http: 2, google: 1 };

    function shouldProcess(url: string, source: string): boolean {
      const entry = processed.get(url);
      if (!entry) return true;
      if (Date.now() - entry.timestamp > TTL) {
        processed.delete(url);
        return true;
      }
      return PRIORITY[source as keyof typeof PRIORITY] > PRIORITY[entry.source as keyof typeof PRIORITY];
    }

    processed.set('https://example.com', { timestamp: Date.now() - 100, source: 'com' });
    await new Promise(r => setTimeout(r, 10));
    expect(shouldProcess('https://example.com', 'google')).toBe(true);
  });
});
