import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { TerminalProfile } from '@stores/types';
import type { XtermTerminalHandle } from '@components/terminal/XtermTerminal';

const MAX_SESSION_OUTPUT_BYTES = 100 * 1024;

interface PtyLifecycleParams {
  activeTab: { sessionId?: string } | undefined;
}

export function useTerminalPtyLifecycle({ activeTab }: PtyLifecycleParams) {
  const xtermRef = useRef<XtermTerminalHandle | null>(null);
  const sessionOutputsRef = useRef<Map<string, string>>(new Map());

  const {
    terminalCreateTab,
    terminalSelectTab,
    terminalCloseTab,
    terminalUpdateActiveTab,
    terminalCloseAllTabs,
    recentWorkspaces,
    activeRightTool,
  } = useAppStore(
    useShallow((state) => ({
      terminalCreateTab: state.terminalCreateTab,
      terminalSelectTab: state.terminalSelectTab,
      terminalCloseTab: state.terminalCloseTab,
      terminalUpdateActiveTab: state.terminalUpdateActiveTab,
      terminalCloseAllTabs: state.terminalCloseAllTabs,
      recentWorkspaces: state.recentWorkspaces,
      activeRightTool: state.activeRightTool,
    })),
  );

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
      console.log(
        `[ADL-DEBUG] handleCreateTab called: profile=${profile}, workspaceId=${workspaceId}, xtermRef.current exists=${!!xtermRef.current}`,
      );
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

      console.log(
        `[ADL-DEBUG] handleCreateTab: finalProfile=${finalProfile}, calling xtermRef.current?.clear()`,
      );
      xtermRef.current?.clear();
      console.log(`[ADL-DEBUG] handleCreateTab: calling terminalCreateTab`);
      terminalCreateTab(finalProfile, workspaceId ?? '');

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
        console.log(
          `[ADL-DEBUG] Creating terminal: profile=${finalProfile}, shell=${shellMap[finalProfile]}, cwd=${cwd}`,
        );
        const result = await window.digitalLife.pty.create({
          shell: shellMap[finalProfile],
          cwd,
          cols,
          rows,
        });
        console.log(`[ADL-DEBUG] PTY create result:`, result);
        if (result.ok) {
          console.log(
            `[ADL-DEBUG] Terminal created successfully: sessionId=${result.data.sessionId}`,
          );
          terminalUpdateActiveTab({ sessionId: result.data.sessionId, status: 'running' });
          console.log(
            `[ADL-DEBUG] terminalUpdateActiveTab called with sessionId=${result.data.sessionId}`,
          );

          setTimeout(() => {
            console.log(
              `[ADL-DEBUG] setTimeout callback: checking sessionOutputsRef for sessionId=${result.data.sessionId}`,
            );
            const stored = sessionOutputsRef.current.get(result.data.sessionId) ?? '';
            console.log(`[ADL-DEBUG] stored output length: ${stored.length}`);
            if (stored) {
              console.log(`[ADL-DEBUG] Writing stored output to xterm`);
              xtermRef.current?.write(stored);
            }
            console.log(`[ADL-DEBUG] Calling xtermRef.current?.resize()`);
            xtermRef.current?.resize();
            console.log(`[ADL-DEBUG] Calling xtermRef.current?.focus()`);
            xtermRef.current?.focus();
            console.log(`[ADL-DEBUG] setTimeout callback completed`);
          }, 50);
        } else {
          /* terminal creation failed */
          const errorMsg = result.error?.message || 'Unknown error';
          console.error(`[ADL-DEBUG] Terminal creation failed:`, errorMsg);
          terminalUpdateActiveTab({ status: 'terminated' });
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
        console.error(`[ADL-DEBUG] Terminal creation error:`, err);
        terminalUpdateActiveTab({ status: 'terminated' });
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
    [terminalCreateTab, terminalUpdateActiveTab, recentWorkspaces],
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      console.log(`[ADL-DEBUG] handleSelectTab called: tabId=${tabId}`);
      terminalSelectTab(tabId);
      const tabs = useAppStore.getState().terminalTabs;
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        const sessionId = tab.sessionId;
        console.log(`[ADL-DEBUG] handleSelectTab: clearing xterm for sessionId=${sessionId}`);
        xtermRef.current?.clear();
        setTimeout(() => {
          const stored = sessionOutputsRef.current.get(sessionId) ?? '';
          console.log(
            `[ADL-DEBUG] handleSelectTab: stored output length=${stored.length} for sessionId=${sessionId}`,
          );
          if (stored) {
            xtermRef.current?.write(stored);
          }
          xtermRef.current?.resize();
          xtermRef.current?.scrollToBottom();
          xtermRef.current?.focus();
          console.log(`[ADL-DEBUG] handleSelectTab: content restored`);
        }, 50);
      } else {
        console.log(`[ADL-DEBUG] handleSelectTab: tab has no sessionId yet, skipping restore`);
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
      }
      terminalCloseTab(tabId);
    },
    [terminalCloseTab],
  );

  const handleCloseAllTabs = useCallback(() => {
    const tabs = useAppStore.getState().terminalTabs;
    tabs.forEach((tab) => {
      if (tab.sessionId) {
        window.digitalLife.pty.kill(tab.sessionId);
        sessionOutputsRef.current.delete(tab.sessionId);
      }
    });
    terminalCloseAllTabs();
  }, [terminalCloseAllTabs]);

  const handleKill = useCallback(() => {
    if (activeTab?.sessionId) {
      window.digitalLife.pty.kill(activeTab.sessionId);
      terminalUpdateActiveTab({ status: 'terminated' });
    }
  }, [activeTab?.sessionId, terminalUpdateActiveTab]);

  useEffect(() => {
    if (activeRightTool !== 'terminal') {
      console.log(
        `[ADL-DEBUG] subscribePtyOutput effect: activeRightTool is not terminal, skipping`,
      );
      return;
    }

    console.log(
      `[ADL-DEBUG] subscribePtyOutput effect: setting up subscription for activeTab?.sessionId=${activeTab?.sessionId}`,
    );
    const unsub = window.digitalLife.subscribePtyOutput((event) => {
      console.log(
        `[ADL-DEBUG] subscribePtyOutput: received event for sessionId=${event.sessionId}, data length=${event.data.length}`,
      );
      const outputs = sessionOutputsRef.current;
      let previous = outputs.get(event.sessionId) ?? '';
      previous += event.data;
      if (previous.length > MAX_SESSION_OUTPUT_BYTES) {
        previous = previous.slice(previous.length - MAX_SESSION_OUTPUT_BYTES);
      }
      outputs.set(event.sessionId, previous);
      console.log(
        `[ADL-DEBUG] subscribePtyOutput: stored output for sessionId=${event.sessionId}, total length=${previous.length}`,
      );
      if (event.sessionId === activeTab?.sessionId) {
        console.log(
          `[ADL-DEBUG] subscribePtyOutput: writing to xterm for activeTab sessionId=${activeTab?.sessionId}`,
        );
        xtermRef.current?.write(event.data);
      } else {
        console.log(
          `[ADL-DEBUG] subscribePtyOutput: event sessionId=${event.sessionId} does not match activeTab sessionId=${activeTab?.sessionId}, not writing to xterm`,
        );
      }
    });
    return () => unsub();
  }, [activeTab?.sessionId, activeRightTool]);

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
