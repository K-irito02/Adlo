import { describe, expect, it } from 'vitest';
import { createHttpBridge } from '../../../httpBridge';

describe('clipboard bridge contract', () => {
  const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:1' });

  it('exposes write + asset url builders, not writeImage', () => {
    expect(typeof bridge.clipboard.write).toBe('function');
    expect(typeof bridge.clipboard.getHtmlUrl).toBe('function');
    expect(typeof bridge.clipboard.getRtfUrl).toBe('function');
    expect('writeImage' in bridge.clipboard).toBe(false);
  });

  it('builds asset urls from basename only', () => {
    expect(bridge.clipboard.getHtmlUrl('/data/clipboard/html/abc.html')).toBe(
      'http://127.0.0.1:1/clipboard/html/abc.html',
    );
    expect(bridge.clipboard.getRtfUrl('')).toBe('');
  });
});
