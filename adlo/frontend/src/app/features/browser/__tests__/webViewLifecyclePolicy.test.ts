import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { consumeFreshAndDecideWebViewCreation } from '../webViewLifecyclePolicy';
const reset = () => useAppStore.setState({ browserFreshTabIds: new Set<string>() });

describe('consumeFreshAndDecideWebViewCreation', () => {
  beforeEach(reset);

  it('creates the WebView for a fresh download tab and consumes the marker', () => {
    useAppStore.getState().browserMarkTabFresh('tab-1');

    const decision = consumeFreshAndDecideWebViewCreation('tab-1', 'https://example.com/a.zip');

    expect(decision).toEqual({ isFresh: true, suppressDownload: false });
    expect(useAppStore.getState().browserConsumeTabFresh('tab-1')).toBe(false);
  });

  it('suppresses WebView creation for a restart-hydrated download tab', () => {
    expect(consumeFreshAndDecideWebViewCreation('tab-2', 'https://example.com/a.zip')).toEqual({
      isFresh: false,
      suppressDownload: true,
    });
  });

  it('creates the WebView for a normal URL even without a fresh marker', () => {
    expect(consumeFreshAndDecideWebViewCreation('tab-3', 'https://example.com/article')).toEqual({
      isFresh: false,
      suppressDownload: false,
    });
  });
});
