import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isPrivateUrl,
  domainOf,
  RobotsCache,
  DomainRateLimiter,
  robotsCacheTtlMs,
  robotsAllowFetch,
} from './crawlerPolicy';
import { parseRobotsTxt } from './crawlerRobots';
import { fromPartial } from '@total-typescript/shoehorn';
import { USER_AGENT } from '../src/shared/userAgent';

describe('crawlerPolicy', () => {
  it('isPrivateUrl detects localhost and private ranges', () => {
    expect(isPrivateUrl('http://localhost:3000')).toBe(true);
    expect(isPrivateUrl('http://127.0.0.1/')).toBe(true);
    expect(isPrivateUrl('http://192.168.1.1/')).toBe(true);
    expect(isPrivateUrl('http://10.0.0.5/')).toBe(true);
    expect(isPrivateUrl('http://172.16.5.5/')).toBe(true);
    expect(isPrivateUrl('http://169.254.1.1/')).toBe(true);
    expect(isPrivateUrl('not-a-url')).toBe(true);
    expect(isPrivateUrl('http://[::1]/')).toBe(true);
  });

  it('isPrivateUrl leaves public hosts alone', () => {
    expect(isPrivateUrl('https://example.com/')).toBe(false);
    expect(isPrivateUrl('https://github.com/K-irito02/Adlo')).toBe(false);
    expect(isPrivateUrl('http://8.8.8.8/')).toBe(false);
  });

  it('domainOf extracts host', () => {
    expect(domainOf('https://example.com/a/b')).toBe('example.com');
    expect(domainOf('https://a.example.com:8080/x')).toBe('a.example.com');
    expect(domainOf('not-a-url')).toBeNull();
  });

  it('robots cache hits within ttl and expires after', () => {
    const cache = new RobotsCache();
    const t0 = 1000;
    cache.insert('example.com', parseRobotsTxt('User-agent: *\nDisallow: /x'), t0);
    expect(cache.get('example.com', t0 + 60_000)).not.toBeNull();
    expect(cache.get('example.com', t0 + robotsCacheTtlMs + 1)).toBeNull();
    expect(cache.get('other.com', t0)).toBeNull();
  });

  it('rate limiter blocks same domain within window', () => {
    const limiter = new DomainRateLimiter(5000);
    const t0 = 1000;
    expect(limiter.tryAcquire('example.com', t0)).toBe(true);
    expect(limiter.tryAcquire('example.com', t0 + 2000)).toBe(false);
    expect(limiter.tryAcquire('example.com', t0 + 5000)).toBe(true);
    expect(limiter.tryAcquire('other.com', t0)).toBe(true);
  });

  it('robotsAllowFetch: private url bypasses robots', async () => {
    const fetchImpl = vi.fn();
    expect(await robotsAllowFetch('http://localhost:3000', fetchImpl)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('robotsAllowFetch: fail-open on robots fetch failure', async () => {
    const fetchImpl = vi.fn(async () => fromPartial<Response>({ ok: false, status: 500 }));
    expect(await robotsAllowFetch('https://example.com/x', fetchImpl, 1000)).toBe(true);
  });

  it('robots fetch sends canonical USER_AGENT header (mirror invariant)', async () => {
    const fetchImpl = vi.fn(async () => fromPartial<Response>({ ok: false, status: 500 }));
    await robotsAllowFetch('https://example.com/x', fetchImpl, 1000);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/robots.txt',
      expect.objectContaining({ headers: { 'User-Agent': USER_AGENT } }),
    );
  });

  it('robotsAllowFetch: disallow hard blocks public url', async () => {
    const body = 'User-agent: Adlo\nDisallow: /private\n';
    const fetchImpl = vi.fn(async () =>
      fromPartial<Response>({ ok: true, status: 200, text: async () => body }),
    );
    expect(await robotsAllowFetch('https://example.com/private/a', fetchImpl, 1000)).toBe(false);
    expect(await robotsAllowFetch('https://example.com/public', fetchImpl, 2000)).toBe(true);
  });
});
