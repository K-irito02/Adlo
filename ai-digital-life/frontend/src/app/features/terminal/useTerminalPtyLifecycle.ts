import { useCallback, useEffect, useRef } from 'react';
import type { TerminalTabState } from '@stores/slices/terminalSliceTypes';
import { terminalXtermPool } from './terminalXtermPool';
import { terminalPtyRuntime, type PaneRef } from './terminalPtyRuntime';

interface PtyLifecycleParams {
  activeTab: TerminalTabState | undefined;
}

/**
 * 终端 PTY 生命周期的**视图侧 Hook**。
 *
 * 真正的共享状态与全局副作用（输出订阅、beforeunload）都在应用级
 * 单例 `terminalPtyRuntime` 中；本 Hook 只做两件事：
 * - 确保单例已启动（幂等）；
 * - 用本视图的 `activeTab` 把输入/缩放/kill 转发给单例，并暴露按窗格动作。
 *
 * 因此右面板与中心各挂载一次是安全的：全局工作只跑一份，共享状态由单例拥有。
 */
export function useTerminalPtyLifecycle({ activeTab }: PtyLifecycleParams) {
  useEffect(() => {
    terminalPtyRuntime.ensureStarted();
  }, []);

  // 启动激活：恢复的标签其会话必然已不存在（应用退出时会话被 kill），
  // 因此在启动时对「上一次运行遗留的活动标签」的每个窗格各走一次激活（重建会话）。
  const startupHandledRef = useRef(false);
  useEffect(() => {
    if (startupHandledRef.current) {
      return;
    }
    startupHandledRef.current = true;
    if (!activeTab) {
      return;
    }
    for (const pane of activeTab.panes) {
      // 本次运行已建过的会话无需再激活；无会话的窗格（上次建会话中途退出）也要补建。
      if (pane.sessionId && terminalPtyRuntime.isCreatedSession(pane.sessionId)) {
        continue;
      }
      void terminalPtyRuntime.activatePane(activeTab.id, pane.id);
    }
  }, [activeTab]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      terminalXtermPool.syncTheme();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  // 调用方（窗格组件）只传自己的 paneId；这里从活动标签的窗格集合里组成 PaneRef。
  const paneRefOf = useCallback(
    (paneId: string): PaneRef | undefined => {
      if (!activeTab) {
        return undefined;
      }
      const pane = activeTab.panes.find((p) => p.id === paneId);
      if (!pane) {
        return undefined;
      }
      return { tabId: activeTab.id, paneId, sessionId: pane.sessionId };
    },
    [activeTab],
  );

  const handleXtermData = useCallback(
    (paneId: string, data: string) => terminalPtyRuntime.handleXtermData(paneRefOf(paneId), data),
    [paneRefOf],
  );

  const handleXtermResize = useCallback(
    (paneId: string, cols: number, rows: number) =>
      terminalPtyRuntime.handleXtermResize(paneRefOf(paneId), cols, rows),
    [paneRefOf],
  );

  const handleKillPane = useCallback(
    (paneId: string) => terminalPtyRuntime.handleKillPane(paneRefOf(paneId)),
    [paneRefOf],
  );

  return {
    handleXtermData,
    handleXtermResize,
    handleKillPane,
    handleCreatePane: terminalPtyRuntime.handleCreatePane,
    handleClosePane: terminalPtyRuntime.handleClosePane,
    handleCreateTab: terminalPtyRuntime.handleCreateTab,
    handleSelectTab: terminalPtyRuntime.handleSelectTab,
    handleCloseTab: terminalPtyRuntime.handleCloseTab,
    handleCloseAllTabs: terminalPtyRuntime.handleCloseAllTabs,
  };
}
