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

  it('resolves tsx/mts/cts aliases to TypeScript (R1-F1)', async () => {
    await ensureStarryNight();
    for (const lang of ['tsx', 'mts', 'cts']) {
      const highlighted = highlightWithStarry('<A x={1} />;', lang);
      expect(highlighted).not.toBeNull();
      expect(highlighted).toContain('pl-');
    }
  });

  it('never throws on prototype-chain or odd language names (R1 rev3 medium)', async () => {
    await ensureStarryNight();
    for (const lang of [
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
      'TSX',
      'TypeScript',
    ]) {
      expect(() => highlightWithStarry('x = 1;', lang)).not.toThrow();
    }
    expect(highlightWithStarry('x = 1;', 'constructor')).toBeNull();
    // 大写走归一化后仍命中别名表（R1 rev4终轮 C2：不断言非空则归一化回归不可见）
    const upper = highlightWithStarry('<A x={1} />;', 'TSX');
    expect(upper).not.toBeNull();
    expect(upper).toContain('pl-');
  });
});
