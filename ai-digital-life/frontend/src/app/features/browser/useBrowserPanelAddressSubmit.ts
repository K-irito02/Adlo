import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { findInBrowserLookupIndex } from './useBrowserSearch';
import { checkEmbed, isEmbedBlocked } from './checkEmbed';
import type { MetaSource, PageMeta } from '@shared/ipc/browser';
import { pageMetaClient } from '@utils/pageMetaClient';

interface UseBrowserPanelAddressSubmitParams {
  address: string;
  setAddress: (address: string) => void;
  browserLookupIndex: { title: string; url: string }[];
  handleNavigationStart: (url: string) => void;
  navigateBrowser: (url: string) => void;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  setIframeLoadError: Dispatch<SetStateAction<boolean>>;
  setIframeBlockedDetected: Dispatch<SetStateAction<boolean>>;
  handlePageMeta: (meta: PageMeta, source?: MetaSource) => void;
  addressSubmittedForTabRef: MutableRefObject<string>;
  submitVersionRef: MutableRefObject<number>;
  validatedUrlsRef: MutableRefObject<Set<string>>;
}

export function useBrowserPanelAddressSubmit({
  address,
  setAddress,
  browserLookupIndex,
  handleNavigationStart,
  navigateBrowser,
  browserNavigateActiveTab,
  setIframeLoadError,
  setIframeBlockedDetected,
  handlePageMeta,
  addressSubmittedForTabRef,
  submitVersionRef,
  validatedUrlsRef,
}: UseBrowserPanelAddressSubmitParams): { submitAddress: () => Promise<void> } {
  const submitAddress = useCallback(async () => {
    const input = address.trim();
    if (!input) {
      // Empty input: restore the address bar to the current tab's URL
      // instead of showing the landing page. This ensures that pressing
      // Enter with an empty address bar (e.g. after clicking "+") does
      // not change anything — the user must enter a URL to navigate.
      const state = useAppStore.getState();
      const activeTab = state.browserTabs.find((t) => t.id === state.browserActiveTabId);
      const currentUrl = activeTab?.url ?? '';
      addressSubmittedForTabRef.current = currentUrl || 'about:blank';
      setAddress(currentUrl === 'about:blank' ? '' : currentUrl);
      return;
    }

    addressSubmittedForTabRef.current = '';
    const matchedItem = findInBrowserLookupIndex(browserLookupIndex, input);
    const finalUrl = matchedItem?.url
      ? matchedItem.url
      : /^[a-z]+:\/\/|about:/i.test(input.trim())
        ? input.trim()
        : `https://${input.trim()}`;

    const version = ++submitVersionRef.current;

    if (!useAppStore.getState().isTauri) {
      const cached = isEmbedBlocked(finalUrl);
      if (cached !== undefined) {
        if (submitVersionRef.current !== version) {
          return;
        }
        if (cached) {
          setIframeBlockedDetected(true);
          setIframeLoadError(true);
        } else {
          validatedUrlsRef.current.add(finalUrl);
        }
        if (!cached) {
          navigateBrowser(finalUrl);
        }
      } else {
        const blocked = await checkEmbed(finalUrl);
        if (submitVersionRef.current !== version) {
          return;
        }

        if (blocked) {
          setIframeBlockedDetected(true);
          setIframeLoadError(true);
        } else {
          validatedUrlsRef.current.add(finalUrl);
        }

        if (!blocked) {
          navigateBrowser(finalUrl);
        }
      }
    }

    // Always defer tab creation until real title arrives via handlePageMeta
    handleNavigationStart(finalUrl);
    setAddress(finalUrl);
    if (useAppStore.getState().isTauri) {
      browserNavigateActiveTab(finalUrl, undefined);
    }

    if (!useAppStore.getState().isTauri && finalUrl) {
      pageMetaClient.get(finalUrl).then((meta) => {
        if (!meta) {
          useAppStore.getState().browserAddToHistory(finalUrl, finalUrl);
          return;
        }
        handlePageMeta(
          {
            title: meta.title || finalUrl,
            favicon: meta.favicon || '',
            faviconDataUri: meta.faviconDataUri || '',
            url: finalUrl,
          },
          'http',
        );
      });
    }
  }, [
    address,
    browserLookupIndex,
    handleNavigationStart,
    navigateBrowser,
    browserNavigateActiveTab,
    setIframeLoadError,
    setIframeBlockedDetected,
    handlePageMeta,
    setAddress,
    addressSubmittedForTabRef,
    submitVersionRef,
    validatedUrlsRef,
  ]);

  return { submitAddress };
}
