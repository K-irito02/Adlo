import { useCallback, useEffect, useRef } from 'react';
import type { BrowserMediaCommand, BrowserMediaStatePayload } from '@shared/ipc/browser';
import { useAppStore } from '@stores/slicedStore';
import {
  currentMediaSessionSource,
  onMediaSessionCommand,
  setMediaSessionSource,
} from '../media-session/systemMediaSession';

/** 结束判定容差（秒）：站点常常停在 duration - 几十毫秒。 */
const ENDED_TOLERANCE_SECONDS = 0.75;

function isFinished(state: BrowserMediaStatePayload): boolean {
  if (state.ended) {
    return true;
  }
  return state.duration > 0 && state.position >= state.duration - ENDED_TOLERANCE_SECONDS;
}

function sourceIdFor(tabId: string): string {
  return `tab:${tabId}`;
}

/**
 * 内置浏览器标签页 → 系统媒体卡片（事项 17 路线 A）。
 *
 * 背景：Chromium 的 `MediaSessionService` 在 Adlo 内被关闭（会话归属
 * `msedgewebview2.exe`，卡片恒「未知应用」），系统卡片改由 Rust SMTC 承载。
 * 注入脚本把站点 `navigator.mediaSession` 标题与页面媒体状态上报给 Rust，再经事件
 * 到这里；本 hook 把**每个标签页**登记为一个媒体源（`tab:<tabId>`），由
 * `systemMediaSession` 统一做归属与轮播（本地预览与标签页同级、无优先级）。
 *
 * 关键约束：快照事件只登记**收到事件的那个标签页**；`tabs` 变化（标题回退、标签关闭）
 * 会重新发布仍存活的源。同一标签页的快照签名不变时不重发：否则重复上报会刷新
 * `systemMediaSession` 的 `at`，该源的过期清理被推迟（长时间不播放也可能继续占位）。
 *
 * 卡片只显示标题（不显示副标题），所以这里只上报 title/status/进度。
 */
export function useBrowserSystemMedia(): void {
  const tabs = useAppStore((s) => s.browserTabs);
  const snapshotsRef = useRef(new Map<string, BrowserMediaStatePayload>());
  /** tabId → 上次下发的 claim 签名；同签名不重发（避免刷新 `systemMediaSession` 的心跳）。 */
  const publishedRef = useRef(new Map<string, string>());

  const unpublish = useCallback((tabId: string) => {
    if (!publishedRef.current.delete(tabId)) {
      return;
    }
    setMediaSessionSource(sourceIdFor(tabId), null);
  }, []);

  const publish = useCallback(
    (tabId: string) => {
      const snapshot = snapshotsRef.current.get(tabId);
      if (!snapshot) {
        return;
      }
      const tab = useAppStore.getState().browserTabs.find((candidate) => candidate.id === tabId);
      const title = snapshot.title || tab?.title || '';
      if (!title || isFinished(snapshot)) {
        unpublish(tabId);
        return;
      }
      const claim = {
        title,
        status: snapshot.paused ? ('paused' as const) : ('playing' as const),
        positionMs: snapshot.position * 1000,
        durationMs: snapshot.duration > 0 ? snapshot.duration * 1000 : undefined,
      };
      const signature = JSON.stringify(claim);
      if (publishedRef.current.get(tabId) === signature) {
        return;
      }
      publishedRef.current.set(tabId, signature);
      setMediaSessionSource(sourceIdFor(tabId), claim);
    },
    [unpublish],
  );

  useEffect(() => {
    if (!window.digitalLife?.mediaSession?.supported) {
      return undefined;
    }
    const browser = window.digitalLife?.browser;
    if (!browser) {
      return undefined;
    }
    return browser.onMediaStateChanged((payload) => {
      snapshotsRef.current.set(payload.tabId, payload);
      publish(payload.tabId);
    });
  }, [publish]);

  useEffect(() => {
    const liveTabIds = new Set(tabs.map((tab) => tab.id));

    // 标签关闭：撤销来源（快照也一并丢弃）。
    for (const tabId of [...publishedRef.current.keys()]) {
      if (!liveTabIds.has(tabId)) {
        unpublish(tabId);
        snapshotsRef.current.delete(tabId);
      }
    }
    for (const tabId of [...snapshotsRef.current.keys()]) {
      if (!liveTabIds.has(tabId)) {
        snapshotsRef.current.delete(tabId);
        continue;
      }
      // 标签标题/状态变化时刷新回退标题；同签名不会改心跳。
      publish(tabId);
    }
  }, [tabs, publish, unpublish]);

  useEffect(() => {
    if (!window.digitalLife?.mediaSession?.supported) {
      return undefined;
    }
    return onMediaSessionCommand('browser', (command: BrowserMediaCommand) => {
      // 卡片按钮只作用于「当前轮播到的那一个」标签页。
      const displayed = currentMediaSessionSource();
      if (!displayed?.startsWith('tab:')) {
        return;
      }
      const tabId = displayed.slice('tab:'.length);
      // 卡片是尽力而为的控制面：标签已被销毁等失败不打断用户。
      void window.digitalLife.browser.mediaControlTab(tabId, command).catch(() => undefined);
    });
  }, []);
}
