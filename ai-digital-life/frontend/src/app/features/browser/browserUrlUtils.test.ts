import { describe, it, expect } from 'vitest';
import { isSearchQuery, buildSearchUrl, ensureProtocol } from './browserUrlUtils';
import type { SearchEngine } from './browserUrlUtils';

describe('isSearchQuery', () => {
  it('returns false for URLs with protocol', () => {
    expect(isSearchQuery('https://github.com')).toBe(false);
    expect(isSearchQuery('http://example.com')).toBe(false);
  });
  it('returns false for about: URLs', () => {
    expect(isSearchQuery('about:blank')).toBe(false);
  });
  it('returns false for IP addresses', () => {
    expect(isSearchQuery('192.168.1.1')).toBe(false);
  });
  it('returns false for localhost', () => {
    expect(isSearchQuery('localhost:3000')).toBe(false);
  });
  it('returns true for strings with spaces', () => {
    expect(isSearchQuery('react hooks')).toBe(true);
  });
  it('returns true for Chinese text', () => {
    expect(isSearchQuery('你好世界')).toBe(true);
  });
  it('returns true for strings without dots', () => {
    expect(isSearchQuery('github')).toBe(true);
  });
});

describe('buildSearchUrl', () => {
  const googleEngine: SearchEngine = {
    id: 'google',
    name: 'Google',
    urlTemplate: 'https://www.google.com/search?q=%s',
    isBuiltIn: true,
    isDefault: true,
  };
  it('replaces %s with encoded query', () => {
    expect(buildSearchUrl(googleEngine, 'react hooks')).toBe(
      'https://www.google.com/search?q=react%20hooks',
    );
  });
  it('encodes Chinese characters', () => {
    expect(buildSearchUrl(googleEngine, '你好')).toBe(
      'https://www.google.com/search?q=%E4%BD%A0%E5%A5%BD',
    );
  });
});

describe('ensureProtocol', () => {
  it('preserves existing protocol', () => {
    expect(ensureProtocol('https://github.com')).toBe('https://github.com');
  });
  it('preserves about: URLs', () => {
    expect(ensureProtocol('about:blank')).toBe('about:blank');
  });
  it('adds https:// to bare domains', () => {
    expect(ensureProtocol('github.com')).toBe('https://github.com');
  });
});
