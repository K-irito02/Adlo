import { useEffect, useReducer, useRef } from 'react';
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
 * 注入脚本把站点 `navigator.mediaSession` 元数据与页面媒体状态上报给 Rust，再经事件
 * 到这里；本 hook 把**每个标签页**登记为一个媒体源（`tab:<tabId>`），由
 * `systemMediaSession` 统一做归属与轮播（本地预览与标签页同级、无优先级）。
 *
 * 卡片只显示标题（不显示副标题），所以这里只上报 title/status/进度。
 */
export function useBrowserSystemMedia(): void {
  const tabs = useAppStore((s) => s.browserTabs);
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const snapshotsRef = useRef(new Map<string, BrowserMediaStatePayload>());
  const publishedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!window.digitalLife?.mediaSession?.supported) {
      return undefined;
    }
    const browser = window.digitalLife.browser;
    if (!browser?.onMediaStateChanged) {
      return undefined;
    }
    return browser.onMediaStateChanged((payload) => {
      snapshotsRef.current.set(payload.tabId, payload);
      bump();
    });
  }, []);

  useEffect(() => {
    const liveTabIds = new Set(tabs.map((tab) => tab.id));

    // 标签关闭：撤销来源（快照也一并丢弃）。
    for (const tabId of publishedRef.current) {
      if (!liveTabIds.has(tabId)) {
        setMediaSessionSource(sourceIdFor(tabId), null);
        publishedRef.current.delete(tabId);
        snapshotsRef.current.delete(tabId);
      }
    }

    for (const [tabId, state] of snapshotsRef.current) {
      if (!liveTabIds.has(tabId)) {
        continue;
      }
      const tab = tabs.find((candidate) => candidate.id === tabId);
      const title = state.title || tab?.title || '';
      if (!title || isFinished(state)) {
        setMediaSessionSource(sourceIdFor(tabId), null);
        publishedRef.current.delete(tabId);
        continue;
      }
      setMediaSessionSource(sourceIdFor(tabId), {
        title,
        status: state.paused ? 'paused' : 'playing',
        positionMs: state.position * 1000,
        durationMs: state.duration > 0 ? state.duration * 1000 : undefined,
      });
      publishedRef.current.add(tabId);
    }
  }, [tabs, version]);

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
