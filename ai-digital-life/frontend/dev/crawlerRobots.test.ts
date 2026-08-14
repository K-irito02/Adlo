import { describe, it, expect } from 'vitest';
import { parseRobotsTxt, isAllowed, productToken, longestMatch } from './crawlerRobots';

describe('crawlerRobots', () => {
  it('productToken takes part before slash', () => {
    expect(productToken('AIDigitalLife/1.0')).toBe('AIDigitalLife');
    expect(productToken('Googlebot')).toBe('Googlebot');
  });

  it('disallow blocks matching path', () => {
    const rules = parseRobotsTxt('User-agent: AIDigitalLife\nDisallow: /private/');
    expect(isAllowed(rules, 'AIDigitalLife/1.0', '/private/data.html')).toBe(false);
  });

  it('allow wins over disallow on equal specificity', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /foo\nAllow: /foo\n');
    expect(isAllowed(rules, 'AIDigitalLife', '/foo')).toBe(true);
  });

  it('most specific user-agent group wins over star', () => {
    const rules = parseRobotsTxt(
      'User-agent: *\nDisallow: /x\n\nUser-agent: AIDigitalLife\nAllow: /\n',
    );
    expect(isAllowed(rules, 'AIDigitalLife/1.0', '/x')).toBe(true);
    expect(isAllowed(rules, 'OtherBot/1.0', '/x')).toBe(false);
  });

  it('comments and blank lines ignored', () => {
    const rules = parseRobotsTxt('# top\n\nUser-agent: AIDigitalLife # inline\n# c\nDisallow: /tmp\n\n');
    expect(isAllowed(rules, 'AIDigitalLife', '/tmp/a')).toBe(false);
    expect(isAllowed(rules, 'AIDigitalLife', '/ok')).toBe(true);
  });

  it('empty allow or disallow ignored', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow:\nAllow:\n');
    expect(isAllowed(rules, 'AIDigitalLife', '/anything')).toBe(true);
  });

  it('no rules for token allows everything', () => {
    const rules = parseRobotsTxt('User-agent: Googlebot\nDisallow: /x\n');
    expect(isAllowed(rules, 'AIDigitalLife/1.0', '/x')).toBe(true);
  });

  it('wildcard star and dollar anchor', () => {
    expect(longestMatch('/a/*/c', '/a/b/c')).toBe(6);
    expect(longestMatch('/a$', '/a')).toBe(2);
    expect(longestMatch('/a$', '/ab')).toBeNull();
    expect(longestMatch('/a', '/ab')).toBe(2);
  });

  it('prefix match longest wins across rules', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /foo/bar\nDisallow: /foo\nAllow: /foo\n');
    expect(isAllowed(rules, 'AIDigitalLife', '/foo/bar')).toBe(false);
    expect(isAllowed(rules, 'AIDigitalLife', '/foo')).toBe(true);
  });
});
