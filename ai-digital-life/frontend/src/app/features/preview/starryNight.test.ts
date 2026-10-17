// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ensureStarryNight, highlightWithStarry, isStarryReady } from './starryNight';

describe('starryNight integration', () => {
  it('initializes from local WASM and highlights TypeScript', async () => {
    const instance = await ensureStarryNight();
    expect(instance).not.toBeNull();
    expect(isStarryReady()).toBe(true);
    expect(instance?.flagToScope('ts')).toBeDefined();
  });

  it('returns pl-* spans for known languages and null otherwise', async () => {
    await ensureStarryNight();
    const highlighted = highlightWithStarry('const a: number = 1;', 'ts');
    expect(highlighted).not.toBeNull();
    expect(highlighted).toContain('pl-');
    expect(highlightWithStarry('x', 'unknown-xyz-lang')).toBeNull();
  });
});
