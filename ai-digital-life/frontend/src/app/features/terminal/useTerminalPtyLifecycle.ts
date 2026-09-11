import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { TerminalProfile } from '@stores/types';
import type { XtermTerminalHandle } from '@components/terminal/XtermTerminal';
import { terminalOutputStore } from './terminalOutputStore';

const MAX_SESSION_OUTPUT_BYTES = 100 * 1024;

/** 判断某会话是否为当前活动标签的会话（回放校验用） */
function isActiveSession(sessionId: string): boolean {
  const state = useAppStore.getState();
  const activeTab = state.terminalTabs.find((t) => t.id === state.terminalActiveTabId);
  return activeTab?.sessionId === sessionId;
}

interface PtyLifecycleParams {
  activeTab: { sessionId?: string } | undefined;
}

export function useTerminalPtyLifecycle({ activeTab }: PtyLifecycleParams) {
  const xtermRef = useRef<XtermTerminalHandle | null>(null);
  const sessionOutputsRef = useRef<Map<string, string>>(new Map());
  const hydratedRef = useRef(false);
  const saveDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // 启动时从持久化存储恢复终端输出到内存 Map
  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;
    const tabs = useAppStore.getState().terminalTabs;
    const sessionIds = tabs.filter((t) => t.sessionId).map((t) => t.sessionId!);
    if (sessionIds.length === 0) {
      return;
    }
    // 并行加载所有有 sessionId 的标签的输出
    Promise.all(
      sessionIds.map(async (sid) => {
        const output = await terminalOutputStore.load(sid);
        return { sid, output };
      }),
    ).then((results) => {
      const map = sessionOutputsRef.current;
      for (const { sid, output } of results) {
        if (output && !map.has(sid)) {
          map.set(sid, output);
        }
      }

    });
  }, []);

  const {
    terminalCreateTab,
    terminalSelectTab,
    terminalCloseTab,
    terminalUpdateActiveTab,
    terminalUpdateTab,
    terminalCloseAllTabs,
    recentWorkspaces,
    activeRightTool,
  } = useAppStore(
    useShallow((state) => ({
      terminalCreateTab: state.terminalCreateTab,
      terminalSelectTab: state.terminalSelectTab,
      terminalCloseTab: state.terminalCloseTab,
      terminalUpdateActiveTab: state.terminalUpdateActiveTab,
      terminalUpdateTab: state.terminalUpdateTab,
      terminalCloseAllTabs: state.terminalCloseAllTabs,
      recentWorkspaces: state.recentWorkspaces,
      activeRightTool: state.activeRightTool,
    })),
  );

  // 标签切换回放期间的守卫：回放窗口内的 live 输出不再单独写入 xterm，
  // 避免与回放的完整缓冲重复显示。
  const restoringSessionRef = useRef<string | null>(null);

  const handleXtermData = useCallback(
    (data: string) => {
      if (activeTab?.sessionId) {
        window.digitalLife.pty.input(activeTab.sessionId, data);
      }
    },
    [activeTab?.sessionId],
  );

  const handleXtermResize = useCallback(
    (cols: number, rows: number) => {
      if (activeTab?.sessionId) {
        window.digitalLife.pty.resize(activeTab.sessionId, cols, rows);
      }
    },
    [activeTab?.sessionId],
  );

  const handleCreateTab = useCallback(
    async (profile?: TerminalProfile, workspaceId?: string) => {
      const shellMap: Record<TerminalProfile, string> = {
        powershell: 'powershell',
        bash: 'bash',
        cmd: 'cmd',
      };

      const { defaultTerminalProfile: currentDefault, workspaceDefaultProfiles: currentProfiles } =
        useAppStore.getState();

      let finalProfile: TerminalProfile;
      if (profile) {
        finalProfile = profile;
      } else if (workspaceId && currentProfiles[workspaceId]) {
        finalProfile = currentProfiles[workspaceId];
      } else {
        finalProfile = currentDefault;
      }

      xtermRef.current?.clear();
      terminalCreateTab(finalProfile, workspaceId ?? '');
      // 捕获新标签 id：create await 期间用户可能切换标签，
      // 用固定 id 而非"当前活动标签"挂载 sessionId，避免挂错标签
      const createdTabId = useAppStore.getState().terminalActiveTabId;

      let cwd: string | undefined;
      if (workspaceId) {
        const workspace = recentWorkspaces.find((w) => w.id === workspaceId);
        cwd = workspace?.path ?? undefined;
      } else {
        // 独立（默认终端目录）终端不跟随当前工作区路径，
        // 传空 cwd 让服务端解析到用户主目录（参考 Windows Terminal 默认行为）
        cwd = undefined;
      }

      const cols = 80;
      const rows = 24;

      try {
        const result = await window.digitalLife.pty.create({
          shell: shellMap[finalProfile],
          cwd,
          cols,
          rows,
        });
        if (result.ok) {
          const sessionId = result.data.sessionId;
          // 与 handleSelectTab 一致：回放窗口内抑制 live 输出，避免重复显示
          restoringSessionRef.current = sessionId;
          terminalUpdateTab(createdTabId, { sessionId, status: 'running' });

          setTimeout(() => {
            // 已被更新的切换/创建覆盖，或当前活动标签已不是该会话时，丢弃过期回放。
            // 注意：此处不清 restoringSessionRef —— 共享守卫可能已被更新的切换占用，
            // 清除会误伤紧随的切换回放；守卫残留对非活动会话无实际影响（下次切换会覆盖）。
            if (restoringSessionRef.current !== sessionId || !isActiveSession(sessionId)) {
              return;
            }
            const stored = sessionOutputsRef.current.get(sessionId) ?? '';
            if (stored) {
              xtermRef.current?.write(stored);
            }
            xtermRef.current?.resize();
            xtermRef.current?.focus();
            restoringSessionRef.current = null;
          }, 50);
        } else {
          /* terminal creation failed */
          const errorMsg = result.error?.message || 'Unknown error';
          console.error('Terminal creation failed:', errorMsg);
          terminalUpdateTab(createdTabId, { status: 'terminated' });
          setTimeout(() => {
            xtermRef.current?.write(
              `\r\n\x1b[31mError: Failed to start ${finalProfile} terminal.\x1b[0m\r\n`,
            );
            xtermRef.current?.write(`\x1b[31m${errorMsg}\x1b[0m\r\n\r\n`);
            if (finalProfile === 'bash') {
              xtermRef.current?.write(
                '\x1b[33mHint: Make sure Git for Windows or WSL is installed.\x1b[0m\r\n',
              );
            }
          }, 50);
        }
      } catch (err) {
        /* terminal creation error */
        console.error('Terminal creation error:', err);
        terminalUpdateTab(createdTabId, { status: 'terminated' });
        setTimeout(() => {
          xtermRef.current?.write(
            `\r\n\x1b[31mError: Failed to start ${finalProfile} terminal.\x1b[0m\r\n`,
          );
          xtermRef.current?.write(
            `\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n\r\n`,
          );
        }, 50);
      }
    },
    [terminalCreateTab, terminalUpdateTab, recentWorkspaces],
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      const currentActiveTabId = useAppStore.getState().terminalActiveTabId;
      if (tabId === currentActiveTabId) {
        return;
      }
      terminalSelectTab(tabId);
      const tabs = useAppStore.getState().terminalTabs;
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        const sessionId = tab.sessionId;
        const stored = sessionOutputsRef.current.get(sessionId) ?? '';
        restoringSessionRef.current = sessionId;
        xtermRef.current?.clear();
        setTimeout(() => {
          if (restoringSessionRef.current !== sessionId || !isActiveSession(sessionId)) {
            return;
          }
          const replay = sessionOutputsRef.current.get(sessionId) ?? '';
          if (replay) {
            xtermRef.current?.write(replay);
          }
          xtermRef.current?.resize();
          xtermRef.current?.scrollToBottom();
          xtermRef.current?.focus();
          restoringSessionRef.current = null;
        }, 50);
      }
    },
    [terminalSelectTab],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tabs = useAppStore.getState().terminalTabs;
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        window.digitalLife.pty.kill(tab.sessionId);
        sessionOutputsRef.current.delete(tab.sessionId);
        terminalOutputStore.delete(tab.sessionId);
      }
      terminalCloseTab(tabId);
    },
    [terminalCloseTab],
  );

  const handleCloseAllTabs = useCallback(
    (workspaceId?: string) => {
      const tabs = useAppStore.getState().terminalTabs;
      const tabsToClose =
        workspaceId !== undefined ? tabs.filter((tab) => tab.workspaceId === workspaceId) : tabs;
      tabsToClose.forEach((tab) => {
        if (tab.sessionId) {
          window.digitalLife.pty.kill(tab.sessionId);
          sessionOutputsRef.current.delete(tab.sessionId);
          terminalOutputStore.delete(tab.sessionId);
        }
      });
      terminalCloseAllTabs(workspaceId);
    },
    [terminalCloseAllTabs],
  );

  const handleKill = useCallback(() => {
    if (activeTab?.sessionId) {
      window.digitalLife.pty.kill(activeTab.sessionId);
      terminalUpdateActiveTab({ status: 'terminated' });
    }
  }, [activeTab?.sessionId, terminalUpdateActiveTab]);

  useEffect(() => {
    if (activeRightTool !== 'terminal') {
      return;
    }

    const unsub = window.digitalLife.subscribePtyOutput((event) => {
      if (event.terminated) {
        // 会话已退出：仅将对应标签置为 terminated，保留输出供用户回看
        const tabs = useAppStore.getState().terminalTabs;
        const tab = tabs.find((t) => t.sessionId === event.sessionId);
        if (tab) {
          terminalUpdateTab(tab.id, { status: 'terminated' });
        }
        // 不删除输出 — 用户仍可滚动查看历史，关闭标签时再清理
        return;
      }

      const outputs = sessionOutputsRef.current;
      let previous = outputs.get(event.sessionId) ?? '';
      previous += event.data;
      if (previous.length > MAX_SESSION_OUTPUT_BYTES) {
        previous = previous.slice(previous.length - MAX_SESSION_OUTPUT_BYTES);
      }
      outputs.set(event.sessionId, previous);
      // 防抖保存：合并高频输出事件，每 500ms 最多写入一次持久化存储
      const existing = saveDebounceRef.current.get(event.sessionId);
      if (existing) {
        clearTimeout(existing);
      }
      saveDebounceRef.current.set(
        event.sessionId,
        setTimeout(() => {
          saveDebounceRef.current.delete(event.sessionId);
          const latest = sessionOutputsRef.current.get(event.sessionId);
          if (latest) {
            terminalOutputStore.save(event.sessionId, latest);
          }
        }, 500),
      );

      if (
        event.sessionId === activeTab?.sessionId &&
        restoringSessionRef.current !== event.sessionId
      ) {
        xtermRef.current?.write(event.data);
      }
    });
    return () => unsub();
  }, [activeTab?.sessionId, activeRightTool, terminalUpdateTab]);

  return {
    xtermRef,
    sessionOutputsRef,
    handleXtermData,
    handleXtermResize,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleKill,
  };
}
