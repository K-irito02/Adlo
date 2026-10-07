import { useCallback, useEffect, useRef } from 'react';
import type { XtermTerminalHandle } from '@components/terminal/XtermTerminal';
import { terminalXtermPool } from './terminalXtermPool';
import { terminalPtyRuntime } from './terminalPtyRuntime';

interface PtyLifecycleParams {
  activeTab: { id: string; sessionId?: string } | undefined;
}

/**
 * 终端 PTY 生命周期的**视图侧 Hook**。
 *
 * 真正的共享状态与全局副作用（输出订阅、beforeunload）都在应用级
 * 单例 `terminalPtyRuntime` 中；本 Hook 只做两件事：
 * - 确保单例已启动（幂等）；
 * - 用本视图的 `activeTab` 把输入/缩放/kill 转发给单例，并暴露按标签动作。
 *
 * 因此右面板与中心各挂载一次是安全的：全局工作只跑一份，共享状态由单例拥有。
 */
export function useTerminalPtyLifecycle({ activeTab }: PtyLifecycleParams) {
  const xtermRef = useRef<XtermTerminalHandle | null>(null);

  useEffect(() => {
    terminalPtyRuntime.ensureStarted();
  }, []);

  // 启动激活：恢复的标签其会话必然已不存在（应用退出时会话被 kill），
  // 因此在启动时对「上一次运行遗留的活动标签」走一次激活（重建会话）。
  const startupHandledRef = useRef(false);
  useEffect(() => {
    if (startupHandledRef.current) {
      return;
    }
    startupHandledRef.current = true;
    const tabId = activeTab?.id;
    if (!tabId) {
      return;
    }
    const sessionId = activeTab?.sessionId;
    // 本次运行已建过的会话无需再激活；无会话的标签（上次建会话中途退出）也要补建。
    if (sessionId && terminalPtyRuntime.isCreatedSession(sessionId)) {
      return;
    }
    void terminalPtyRuntime.activateTab(tabId);
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

  const handleXtermData = useCallback(
    (data: string) => terminalPtyRuntime.handleXtermData(activeTab, data),
    [activeTab],
  );

  const handleXtermResize = useCallback(
    (cols: number, rows: number) => terminalPtyRuntime.handleXtermResize(activeTab, cols, rows),
    [activeTab],
  );

  const handleKill = useCallback(() => terminalPtyRuntime.handleKill(activeTab), [activeTab]);

  return {
    xtermRef,
    handleXtermData,
    handleXtermResize,
    handleCreateTab: terminalPtyRuntime.handleCreateTab,
    handleSelectTab: terminalPtyRuntime.handleSelectTab,
    handleCloseTab: terminalPtyRuntime.handleCloseTab,
    handleCloseAllTabs: terminalPtyRuntime.handleCloseAllTabs,
    handleKill,
  };
}
