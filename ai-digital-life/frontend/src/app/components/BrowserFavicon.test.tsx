import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { BrowserFavicon } from './BrowserFavicon';

describe('BrowserFavicon gating', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders empty placeholder before cache ready (no fallback icon)', async () => {
    const mod = await import('./BrowserFavicon');
    const cache = await import('../utils/siteMetaCache');
    cache.setSiteMetaBackendForTest(cache.createMockSiteMetaBackend());
    render(<mod.BrowserFavicon url="https://a.com" />);
    // before init: placeholder, no <img>
    expect(document.querySelector('.adl-browser-tree__favicon')).toBeNull();
    await act(async () => { await cache.initSiteMetaCache(); });
    // after init: still no cache -> Google fallback img appears
    expect(document.querySelector('.adl-browser-tree__favicon')).not.toBeNull();
  });
});
