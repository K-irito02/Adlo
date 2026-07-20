import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { BrowserNavigatorMode } from './useBrowserTabs';

interface IframeHistoryState {
  index: number;
  entries: string[];
}

interface UseBrowserPanelEffectsParams {
  activeTab: BrowserTabState | undefined;
  addressSubmittedForTabRef: MutableRefObject<string>;
  setAddress: Dispatch<SetStateAction<string>>;
  setIframeHistory: Dispatch<SetStateAction<IframeHistoryState>>;
  browserMenuOpen: boolean;
  setBrowserMenuOpen: Dispatch<SetStateAction<boolean>>;
  browserMenuRef: RefObject<HTMLDivElement | null>;
  addressExpanded: boolean;
  setAddressExpanded: Dispatch<SetStateAction<boolean>>;
  addressSearchRef: RefObject<HTMLLabelElement | null>;
  navigatorMode: BrowserNavigatorMode;
  setNavigatorMode: Dispatch<SetStateAction<BrowserNavigatorMode>>;
  navigatorSearchRef: RefObject<HTMLDivElement | null>;
}

export function useBrowserPanelEffects({
  activeTab,
  addressSubmittedForTabRef,
  setAddress,
  setIframeHistory,
  browserMenuOpen,
  setBrowserMenuOpen,
  browserMenuRef,
  addressExpanded,
  setAddressExpanded,
  addressSearchRef,
  navigatorMode,
  setNavigatorMode,
  navigatorSearchRef,
}: UseBrowserPanelEffectsParams): void {
  useEffect(() => {
    const url = activeTab?.url ?? '';
    addressSubmittedForTabRef.current = url || 'about:blank';
    setAddress(url === 'about:blank' ? '' : url);

    if (!useAppStore.getState().isTauri && url && url !== '' && url !== 'about:blank') {
      requestAnimationFrame(() => {
        setIframeHistory((prev) => {
          if (prev.entries[prev.index] === url) {
            return prev;
          }
          const newEntries = prev.entries.slice(0, prev.index + 1);
          newEntries.push(url);
          if (newEntries.length > 50) {
            newEntries.shift();
          }
          return { index: newEntries.length - 1, entries: newEntries };
        });
      });
    }
  }, [activeTab?.id, activeTab?.url, setAddress, setIframeHistory, addressSubmittedForTabRef]);

  useEffect(() => {
    if (!browserMenuOpen && !addressExpanded && navigatorMode !== 'search') {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!browserMenuRef.current?.contains(target)) {
        setBrowserMenuOpen(false);
      }
      if (!addressSearchRef.current?.contains(target)) {
        setAddressExpanded(false);
      }
      if (navigatorMode === 'search' && !navigatorSearchRef.current?.contains(target)) {
        const isModeBtn = (target as HTMLElement).closest(
          '.adl-tool-navigator__context--secondary .adl-tool-context__iconbtn',
        );
        if (!isModeBtn) {
          setNavigatorMode('tabs');
        }
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [
    addressExpanded,
    browserMenuOpen,
    browserMenuRef,
    addressSearchRef,
    navigatorMode,
    navigatorSearchRef,
    setBrowserMenuOpen,
    setAddressExpanded,
    setNavigatorMode,
  ]);
}
