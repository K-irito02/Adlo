import { useEffect } from 'react';
import { isTauriShell } from '@shared/env';
import { useAppStore } from '@stores';
import { normalizeUrlForCompare } from './browserUrlUtils';

export function useBrowserMetaSubscription(
  handlePageMeta: (meta: { title: string; favicon: string; url: string }) => void,
) {
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const bridge = window.digitalLife?.browser;
    if (!bridge) {
      return;
    }
    const unsub = bridge.onMetaChanged((tabId, meta) => {
      // 无归属 tabId（空串/缺失）与未知 tabId 一律丢弃：无法归属的 meta 若流入
      // handlePageMeta，会在 URL 不匹配时被写入当前活动标签（覆盖其 URL/标题/
      // 图标）。dsh 独立子窗口用保留 tabId "dsh"，同样走此分支。
      if (!tabId) {
        return;
      }
      const state = useAppStore.getState();
      const eventTab = state.browserTabs.find((t) => t.id === tabId);
      if (!eventTab) {
        return;
      }
      const normalizedMetaUrl = normalizeUrlForCompare(meta.url);
      // 注意：此处 URL 身份比较剥离 modal_id（normalizeUrlForCompare），与 handlePageMeta
      // 内部归一不完全一致——下游精确匹配为准，此处仅做事件标签的快速 URL 同步，
      // 不得为"统一"而改动任一侧（视频页 modal_id 语义依赖该差异）。
      if (normalizeUrlForCompare(eventTab.url) !== normalizedMetaUrl) {
        state.browserUpdateTab(tabId, { url: normalizedMetaUrl });
      }
      handlePageMeta(meta);
    });
    return () => {
      unsub();
    };
  }, [handlePageMeta]);
}
