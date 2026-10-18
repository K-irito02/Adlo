import { describe, expect, it } from 'vitest';
import { normalizeOrigin, parseWhitelistLines, whitelistToText } from './originWhitelist';

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

describe('parseWhitelistLines', () => {
  it('splits, normalizes, dedups and reports invalid lines', () => {
    const r = parseWhitelistLines(
      'http://127.0.0.1:3080\n\nhttps://a.com/x\nhttp://127.0.0.1:3080\nbad',
    );
    expect(r.origins).toEqual(['http://127.0.0.1:3080', 'https://a.com']);
    expect(r.invalid).toEqual(['bad']);
  });
});

describe('whitelistToText', () => {
  it('joins with newlines', () => {
    expect(whitelistToText(['http://a', 'https://b'])).toBe('http://a\nhttps://b');
  });
});
