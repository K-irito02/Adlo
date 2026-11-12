import { useCallback } from 'react';
import type { PageMeta } from '@shared/ipc/browser';
import { useBrowserMetaSubscription } from './useBrowserMetaSubscription';
import { handlePageMeta, useBrowserPageMeta } from './useBrowserPageMeta';

/**
 * App-root page-meta wiring.
 *
 * Mount once at the application root: browser tabs can be hosted by the center
 * pane while the right panel shows another tool, so a subscription that lives
 * only in `BrowserPanel` misses every title/favicon event in that state
 * (including `file://` titles, which then stay on the "new tab" placeholder).
 */
export function useGlobalBrowserMeta(): void {
  // Server-side meta broadcasts (cache refresh / silent fetch results).
  useBrowserPageMeta();
  // Stable callback: `useBrowserMetaSubscription` re-subscribes when the
  // listener identity changes, which would drop events on every App render.
  const onMeta = useCallback((meta: PageMeta) => handlePageMeta(meta, 'com'), []);
  // Native WebView2 meta events (DocumentTitleChanged / favicon / postMessage).
  useBrowserMetaSubscription(onMeta);
}
