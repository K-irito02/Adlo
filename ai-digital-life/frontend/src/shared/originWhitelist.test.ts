import { describe, expect, it } from 'vitest';
import { allowlistOrigins, normalizeAgentSiteEntries, normalizeOrigin } from './originWhitelist';

describe('normalizeOrigin', () => {
  it('accepts scheme://host:port and strips path', () => {
    expect(normalizeOrigin('http://127.0.0.1:3080/chat/1')).toBe('http://127.0.0.1:3080');
  });
  it('accepts https host without path', () => {
    expect(normalizeOrigin('https://my-agent.example.com')).toBe('https://my-agent.example.com');
  });
  it('rejects non-http schemes and junk', () => {
    expect(normalizeOrigin('file:///x')).toBeNull();
    expect(normalizeOrigin('ftp://a.com')).toBeNull();
    expect(normalizeOrigin('not a url')).toBeNull();
    expect(normalizeOrigin('')).toBeNull();
  });
});

describe('normalizeAgentSiteEntries', () => {
  it('trims aliases, normalizes origins, drops invalid rows and dedups by origin', () => {
    expect(
      normalizeAgentSiteEntries([
        { alias: '  工作台 ', origin: 'http://127.0.0.1:3080/chat/1' },
        { origin: 'https://my-agent.example.com/x' },
        { alias: '', origin: 'http://127.0.0.1:3080' },
        { alias: '坏', origin: 'not-a-url' },
        null,
      ]),
    ).toEqual([
      { alias: '工作台', origin: 'http://127.0.0.1:3080' },
      { origin: 'https://my-agent.example.com' },
    ]);
  });

  it('rejects non-array input', () => {
    expect(normalizeAgentSiteEntries('http://127.0.0.1:3080')).toEqual([]);
  });

  it('accepts legacy bare-string entries as alias-less origins', () => {
    expect(normalizeAgentSiteEntries(['http://127.0.0.1:3080/chat/1', 'not-a-url'])).toEqual([
      { origin: 'http://127.0.0.1:3080' },
    ]);
  });
});

describe('allowlistOrigins', () => {
  it('returns origins for injection/create calls', () => {
    expect(
      allowlistOrigins([
        { alias: '工作台', origin: 'http://127.0.0.1:3080' },
        { origin: 'https://a.com' },
      ]),
    ).toEqual(['http://127.0.0.1:3080', 'https://a.com']);
  });
});
