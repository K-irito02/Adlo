import { describe, it, expect } from 'vitest';
import { mergePrefPatches } from '../preferencePatchMerge';

describe('mergePrefPatches', () => {
  it('later scalar wins', () => {
    expect(mergePrefPatches({ logLevel: 'info' }, { logLevel: 'trace' })).toEqual({
      logLevel: 'trace',
    });
  });

  it('keeps disjoint scalars from both patches', () => {
    const merged = mergePrefPatches(
      { logLevel: 'debug' },
      { terminalLogMode: 'multi', debugLogMode: 'append' },
    );
    expect(merged).toEqual({
      logLevel: 'debug',
      terminalLogMode: 'multi',
      debugLogMode: 'append',
    });
  });

  it('deep-merges fonts one level so uiFont and codeFont do not overwrite each other', () => {
    const merged = mergePrefPatches(
      { fonts: { uiFont: 'Inter' } },
      { fonts: { codeFont: 'Fira' } },
    );
    expect(merged.fonts).toEqual({ uiFont: 'Inter', codeFont: 'Fira' });
  });

  it('later value wins per font sub-field', () => {
    const merged = mergePrefPatches({ fonts: { uiFont: 'Inter' } }, { fonts: { uiFont: 'Geist' } });
    expect(merged.fonts).toEqual({ uiFont: 'Geist' });
  });

  it('overwrites whole keybinds map (UI always sends the full map)', () => {
    const merged = mergePrefPatches({ keybinds: { a: 'Ctrl+A' } }, { keybinds: { b: 'Ctrl+B' } });
    expect(merged.keybinds).toEqual({ b: 'Ctrl+B' });
  });

  it('does not mutate either input', () => {
    const a = { fonts: { uiFont: 'Inter' } };
    const b = { fonts: { codeFont: 'Fira' } };
    mergePrefPatches(a, b);
    expect(a).toEqual({ fonts: { uiFont: 'Inter' } });
    expect(b).toEqual({ fonts: { codeFont: 'Fira' } });
  });

  it('empty patch is the identity', () => {
    expect(mergePrefPatches({}, { logLevel: 'warn' })).toEqual({ logLevel: 'warn' });
    expect(mergePrefPatches({ logLevel: 'warn' }, {})).toEqual({ logLevel: 'warn' });
  });
});
