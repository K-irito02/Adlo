import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';

export interface OpenInCenterAction {
  /**
   * 新建浏览器标签并移入中心区。用于书签/历史/快捷站点/端口等可能尚未打开为标签的
   * URL 入口。语义：新建中心标签。
   */
  openUrlInCenter: (url: string, title?: string, workspaceId?: string) => void;
  /**
   * 将已打开的浏览器标签移入中心区。语义：移动（不新建标签）。
   */
  moveTabToCenter: (tabId: string) => void;
}

export function useOpenInCenterAction(): OpenInCenterAction {
  const openUrlInCenter = useCallback((url: string, title?: string, workspaceId?: string) => {
    useAppStore.getState().browserOpenTab(url, title, workspaceId);
    const newTabId = useAppStore.getState().browserActiveTabId;
    if (newTabId) {
      useAppStore.getState().centerShowBrowserTab(newTabId);
    }
  }, []);

  const moveTabToCenter = useCallback((tabId: string) => {
    useAppStore.getState().centerShowBrowserTab(tabId);
  }, []);

  return { openUrlInCenter, moveTabToCenter };
}
