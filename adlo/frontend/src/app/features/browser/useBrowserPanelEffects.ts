import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { extractSearchQueryFromUrl } from './browserUrlUtils';

interface IframeHistoryState {
  index: number;
  entries: string[];
}

interface UseBrowserPanelEffectsParams {
  activeTab: BrowserTabState | undefined;
  addressSubmittedForTabRef: MutableRefObject<string>;
  setAddress: Dispatch<SetStateAction<string>>;
  setSearchQueryDisplay: Dispatch<SetStateAction<string>>;
  setIframeHistory: Dispatch<SetStateAction<IframeHistoryState>>;
  browserMenuOpen: boolean;
  setBrowserMenuOpen: Dispatch<SetStateAction<boolean>>;
  browserMenuRef: RefObject<HTMLDivElement | null>;
  addressExpanded: boolean;
  setAddressExpanded: Dispatch<SetStateAction<boolean>>;
  addressSearchRef: RefObject<HTMLLabelElement | null>;
}

export function useBrowserPanelEffects({
  activeTab,
  addressSubmittedForTabRef,
  setAddress,
  setSearchQueryDisplay,
  setIframeHistory,
  browserMenuOpen,
  setBrowserMenuOpen,
  browserMenuRef,
  addressExpanded,
  setAddressExpanded,
  addressSearchRef,
}: UseBrowserPanelEffectsParams): void {
  useEffect(() => {
    const url = activeTab?.url ?? '';
    addressSubmittedForTabRef.current = url || 'about:blank';
    setAddress(url === 'about:blank' ? '' : url);

    // 从搜索结果 URL 中提取查询文本显示在地址栏
    const engines = useAppStore.getState().searchEngines;
    const query = url ? extractSearchQueryFromUrl(url, engines) : '';
    setSearchQueryDisplay(query);

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
  }, [
    activeTab?.id,
    activeTab?.url,
    setAddress,
    setSearchQueryDisplay,
    setIframeHistory,
    addressSubmittedForTabRef,
  ]);

  // 外部点击收起：仅收菜单与地址栏展开。搜索模式不再自动切回 tabs——
  // 用户明确要求点击空白区/它处保持当前模式，离開搜索只经模式按钮手动切换。
  useEffect(() => {
    if (!browserMenuOpen && !addressExpanded) {
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
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [
    addressExpanded,
    browserMenuOpen,
    browserMenuRef,
    addressSearchRef,
    setBrowserMenuOpen,
    setAddressExpanded,
  ]);
}
