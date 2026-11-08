import { describe, expect, it } from 'vitest';
import { createHttpBridge } from '../../../httpBridge';
import { mockClipboard } from '../../../mock/mock-clipboard';

describe('clipboard bridge contract', () => {
  const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:1' });

  it('keeps the clipboard method key set identical between http and mock bridges', () => {
    // 穷尽键 parity：契约增删必须两端同步。tauri/preview 的 clipboard 系
    // http spread + 覆盖（构造即继承），故只锁手写两端 http↔mock。
    expect(Object.keys(mockClipboard).sort()).toEqual(Object.keys(bridge.clipboard).sort());
  });

  it('exposes write + asset url builders, not writeImage', () => {
    expect(typeof bridge.clipboard.write).toBe('function');
    expect(typeof bridge.clipboard.exportUrl).toBe('function');
    expect(typeof bridge.clipboard.getHtmlUrl).toBe('function');
    expect(typeof bridge.clipboard.getRtfUrl).toBe('function');
    expect('writeImage' in bridge.clipboard).toBe(false);
  });

  it('no longer carries the save-to-file capability (moved to the fileSave domain)', () => {
    expect('saveToFile' in bridge.clipboard).toBe(false);
  });

  it('builds asset urls from basename only', () => {
    expect(bridge.clipboard.getHtmlUrl('/data/clipboard/html/abc.html')).toBe(
      'http://127.0.0.1:1/clipboard/html/abc.html',
    );
    expect(bridge.clipboard.getRtfUrl('')).toBe('');
  });

  it('builds the export url from the ad-server base url and the item id', () => {
    const url = bridge.clipboard.exportUrl('abc-1');
    expect(url).toContain('abc-1');
    expect(url).toBe('http://127.0.0.1:1/clipboard/export?id=abc-1');
  });
});
