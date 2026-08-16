import { render, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserFavicon } from './BrowserFavicon';
import * as cache from '../utils/siteMetaCache';

beforeEach(() => { vi.restoreAllMocks(); });

it('renders fallback icon (not blank) before cache ready', () => {
  const { container } = render(<BrowserFavicon url="https://a.com" />);
  expect(container.querySelector('.adl-browser-tree__link-fallback')).not.toBeNull();
});

it('image error does not remove cache (no removeCachedSiteMeta call)', async () => {
  const removeSpy = vi.spyOn(cache, 'removeCachedSiteMeta').mockImplementation(() => {});
  const { container } = render(<BrowserFavicon url="https://a.com" />);
  const img = container.querySelector('.adl-browser-tree__favicon') as HTMLImageElement | null;
  if (img) {
    act(() => { fireEvent.error(img); });
  }
  expect(removeSpy).not.toHaveBeenCalled();
});
