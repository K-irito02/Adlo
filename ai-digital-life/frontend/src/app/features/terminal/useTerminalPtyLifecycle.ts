import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { TerminalProfile } from '../../stores/types';
import type { XtermTerminalHandle } from '../../components/terminal/XtermTerminal';

const MAX_SESSION_OUTPUT_BYTES = 100 * 1024;

interface PtyLifecycleParams {
  activeTab: { sessionId?: string } | undefined;
  rootPath: string | undefined;
}

export function useTerminalPtyLifecycle({ activeTab, rootPath }: PtyLifecycleParams) {
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
    }))
  );

  const handleXtermData = useCallback(
    (data: string) => {
      if (activeTab?.sessionId) {
        window.digitalLife.pty.input(activeTab.sessionId, data);
      }
    },
    [activeTab?.sessionId]
  );

  const handleXtermResize = useCallback(
    (cols: number, rows: number) => {
      if (activeTab?.sessionId) {
        window.digitalLife.pty.resize(activeTab.sessionId, cols, rows);
      }
    },
    [activeTab?.sessionId]
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

      let cwd: string | undefined;
      if (workspaceId) {
        const workspace = recentWorkspaces.find((w) => w.id === workspaceId);
        cwd = workspace?.path ?? undefined;
      } else {
        cwd = rootPath ?? undefined;
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
          terminalUpdateActiveTab({ sessionId: result.data.sessionId, status: 'running' });
          setTimeout(() => {
            const stored = sessionOutputsRef.current.get(result.data.sessionId) ?? '';
            if (stored) {
              xtermRef.current?.write(stored);
            }
            xtermRef.current?.resize();
            xtermRef.current?.focus();
          }, 50);
        } else {
          /* terminal creation failed */
          const errorMsg = result.error?.message || 'Unknown error';
          terminalUpdateActiveTab({ status: 'terminated' });
          setTimeout(() => {
            xtermRef.current?.write(
              `\r\n\x1b[31mError: Failed to start ${profile} terminal.\x1b[0m\r\n`
            );
            xtermRef.current?.write(`\x1b[31m${errorMsg}\x1b[0m\r\n\r\n`);
            if (profile === 'bash') {
              xtermRef.current?.write(
                '\x1b[33mHint: Make sure Git for Windows or WSL is installed.\x1b[0m\r\n'
              );
            }
          }, 50);
        }
      } catch (err) {
        /* terminal creation error */
        terminalUpdateActiveTab({ status: 'terminated' });
        setTimeout(() => {
          xtermRef.current?.write(
            `\r\n\x1b[31mError: Failed to start ${finalProfile} terminal.\x1b[0m\r\n`
          );
          xtermRef.current?.write(
            `\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n\r\n`
          );
        }, 50);
      }
    },
    [terminalCreateTab, terminalUpdateActiveTab, rootPath, recentWorkspaces]
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      terminalSelectTab(tabId);
      const tabs = useAppStore.getState().terminalTabs;
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        const sessionId = tab.sessionId;
        xtermRef.current?.clear();
        setTimeout(() => {
          const stored = sessionOutputsRef.current.get(sessionId) ?? '';
          if (stored) {
            xtermRef.current?.write(stored);
          }
          xtermRef.current?.resize();
          xtermRef.current?.scrollToBottom();
          xtermRef.current?.focus();
        }, 50);
      }
    },
    [terminalSelectTab]
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
    [terminalCloseTab]
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
      return;
    }

    const unsub = window.digitalLife.subscribePtyOutput((event) => {
      const outputs = sessionOutputsRef.current;
      let previous = outputs.get(event.sessionId) ?? '';
      previous += event.data;
      if (previous.length > MAX_SESSION_OUTPUT_BYTES) {
        previous = previous.slice(previous.length - MAX_SESSION_OUTPUT_BYTES);
      }
      outputs.set(event.sessionId, previous);
      if (event.sessionId === activeTab?.sessionId) {
        xtermRef.current?.write(event.data);
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
