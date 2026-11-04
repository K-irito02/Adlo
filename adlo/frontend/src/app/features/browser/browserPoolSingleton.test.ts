import { describe, it, expect, vi, beforeEach } from 'vitest';
import { browserPool } from './browserPoolSingleton';

describe('browserPool (singleton)', () => {
  beforeEach(() => browserPool.reset());

  it('共享成员：创建后两个读取者都能看到', async () => {
    vi.stubGlobal('window', { digitalLife: { isTauri: false, browser: undefined } });
    await browserPool.createForTab('t1', 'https://a.test');
    expect(browserPool.isTabInPool('t1')).toBe(true);
  });
});
