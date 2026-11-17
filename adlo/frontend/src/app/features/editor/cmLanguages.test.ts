import { describe, expect, it } from 'vitest';
import {
  getLanguageExtension,
  getLanguageExtensionSync,
  isLanguageExtensionReady,
  languageSupportsFolding,
} from './cmLanguages';

describe('languageSupportsFolding', () => {
  it('accepts languages with a syntax loader', () => {
    expect(languageSupportsFolding('typescript')).toBe(true);
    expect(languageSupportsFolding('rust')).toBe(true);
  });

  it('rejects plaintext and unknown languages', () => {
    expect(languageSupportsFolding('plaintext')).toBe(false);
    expect(languageSupportsFolding('csharp')).toBe(false);
  });

  it('does not resolve inherited object keys', () => {
    expect(languageSupportsFolding('constructor')).toBe(false);
    expect(languageSupportsFolding('__proto__')).toBe(false);
    expect(languageSupportsFolding('toString')).toBe(false);
  });
});

describe('language extension lookups', () => {
  it('does not treat prototype keys as cached extensions or pending languages', async () => {
    expect(getLanguageExtensionSync('constructor')).toEqual([]);
    expect(await getLanguageExtension('constructor')).toEqual([]);
    expect(isLanguageExtensionReady('constructor')).toBe(true);
  });
});
