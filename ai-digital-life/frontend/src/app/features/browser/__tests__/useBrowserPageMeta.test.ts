import { describe, it, expect } from 'vitest';
import * as mod from '../useBrowserPageMeta';

const { applyBroadcastTitle, titleSourceRef } = mod;

describe('applyBroadcastTitle (light app gate)', () => {
  it('applyBroadcastTitle: placeholder tab is filled by com broadcast', () => {
    expect(applyBroadcastTitle({ title: '', id: 't1' }, 'https://a.com/', '新标题', 'com')).toBe(true);
    expect(applyBroadcastTitle({ title: 'a.com', id: 't1' }, 'https://a.com/', '新标题', 'com')).toBe(true);
  });

  it('applyBroadcastTitle: http/iframe overwrites anything', () => {
    expect(applyBroadcastTitle({ title: '真实', id: 't1' }, 'https://a.com/', '新标题', 'http')).toBe(true);
  });

  it('applyBroadcastTitle: com does not overwrite http-sourced title', () => {
    titleSourceRef.set('t1', 'http');
    expect(applyBroadcastTitle({ title: '真实', id: 't1' }, 'https://a.com/', '陈旧', 'com', titleSourceRef.get('t1'))).toBe(false);
  });
});
