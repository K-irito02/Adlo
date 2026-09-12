import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import type { TerminalProfile } from '@stores/types';
import type { XtermTerminalHandle } from '@components/terminal/XtermTerminal';
import { terminalOutputStore } from './terminalOutputStore';
import { normalizeReportedCwd, scanOsc99 } from './terminalCwdOsc';
import { terminalCwdStore } from './terminalCwdStore';
import { stripConptyRepaintBursts } from './terminalRepaintFilter';
import { terminalXtermPool } from './terminalXtermPool';

const MAX_SESSION_OUTPUT_BYTES = 100 * 1024;

const SHELL_MAP: Record<TerminalProfile, string> = {
  powershell: 'powershell',
  bash: 'bash',
  cmd: 'cmd',
};

interface PtyLifecycleParams {
  activeTab: { id: string; sessionId?: string } | undefined;
}

export function useTerminalPtyLifecycle({ activeTab }: PtyLifecycleParams) {
  const xtermRef = useRef<XtermTerminalHandle | null>(null);
  const sessionOutputsRef = useRef<Map<string, string>>(new Map());
  const saveDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // 进行中的加载（去重：同一会话不会重复发起 IPC 加载）
  const loadPromisesRef = useRef<Map<string, Promise<string | null>>>(new Map());
  // 已完成加载的会话（含加载结果为空的，避免反复重试）
  const loadedSessionIdsRef = useRef<Set<string>>(new Set());
  // PTY 创建时间戳：用于时间窗口过滤 shell 启动清屏序列
  const ptyCreatedAtRef = useRef<Map<string, number>>(new Map());
  const STARTUP_WINDOW_MS = 2000;
  // 本次运行中新建的会话（用于区分「重启恢复的标签」与「新建标签」）
  const createdSessionIdsRef = useRef<Set<string>>(new Set());
  // 当前仍然存活的 PTY 会话（应用重启后恢复的标签不在其中 → 需要重建）
  const liveSessionIdsRef = useRef<Set<string>>(new Set());
  // 重建期间缓冲的用户输入（PTY 创建前收到的按键，PTY 就绪后补发）
  const pendingInputRef = useRef('');
  // 每个会话当前实际生效的 PTY 尺寸：同尺寸的 resize 直接跳过，
  // 否则 ConPTY 每次都会重发整屏（约 250 字节的 `\x1b[K\r\n` 片段）污染输出缓冲，
  // 表现为「每切换一次标签缓冲涨 256 字节」、回放时画面被这些垃圾片段扰动。
  const ptyDimsRef = useRef<Map<string, { cols: number; rows: number }>>(new Map());
  // 每个标签的「上次所在目录」（由 shell 通过 OSC 9;9 上报，按标签持久化）
  const tabCwdRef = useRef<Map<string, string>>(new Map());
  const tabCwdsLoadedRef = useRef(false);
  // OSC 9;9 可能跨块截断：保留各会话的尾部片段用于拼接
  const oscCarryRef = useRef<Map<string, string>>(new Map());

  /** 懒加载持久化的「标签 → 目录」映射（只需一次） */
  const ensureTabCwdsLoaded = useCallback(() => {
    if (tabCwdsLoadedRef.current) {
      return;
    }
    tabCwdsLoadedRef.current = true;
    const stored = terminalCwdStore.loadAll();
    for (const [tabId, cwd] of Object.entries(stored)) {
      tabCwdRef.current.set(tabId, cwd);
    }
  }, []);

  /** 持久化整个「标签 → 目录」映射（写入在 store 内去抖） */
  const persistTabCwds = useCallback(() => {
    const snapshot: Record<string, string> = {};
    tabCwdRef.current.forEach((cwd, tabId) => {
      snapshot[tabId] = cwd;
    });
    terminalCwdStore.saveAll(snapshot);
  }, []);

  const serializeSession = useCallback((sessionId: string) => {
    const entry = terminalXtermPool.get(sessionId);
    if (!entry) {
      return;
    }
    try {
      const state = entry.serializeAddon.serialize({ scrollback: 1000 });
      if (state) {
        terminalOutputStore.save(sessionId, state);
      }
    } catch (err) {
      console.warn('serializeSession failed:', err);
    }
  }, []);

  const terminalTabs = terminalSelectors.useTerminalTabs();
  const sessionIdsKey = useMemo(
    () =>
      Array.from(
        new Set(terminalTabs.map((tab) => tab.sessionId).filter((id): id is string => Boolean(id))),
      )
        .sort()
        .join('|'),
    [terminalTabs],
  );

  /**
   * 确保某会话的持久化输出已加载到内存（去重 + 可等待）。
   * 返回该会话当前可用的输出缓冲（可能为空字符串）。
   */
  const ensureLoaded = useCallback((sessionId: string): Promise<string | null> => {
    if (loadedSessionIdsRef.current.has(sessionId)) {
      return Promise.resolve(sessionOutputsRef.current.get(sessionId) ?? null);
    }
    const inflight = loadPromisesRef.current.get(sessionId);
    if (inflight) {
      return inflight;
    }
    const promise = terminalOutputStore
      .load(sessionId)
      .then((output) => {
        // 仅在该会话尚无内存缓冲时写入，避免覆盖已累积的实时输出
        if (output && !sessionOutputsRef.current.has(sessionId)) {
          // 存量清洗：旧版本缓冲里可能混有 ConPTY 重绘爆发，加载时统一剥离
          const cleaned = stripConptyRepaintBursts(output);
          sessionOutputsRef.current.set(sessionId, cleaned.text);
        }
        return output;
      })
      .catch(() => {
        return null;
      })
      .then((output) => {
        loadPromisesRef.current.delete(sessionId);
        loadedSessionIdsRef.current.add(sessionId);
        return sessionOutputsRef.current.get(sessionId) ?? output;
      });
    loadPromisesRef.current.set(sessionId, promise);
    return promise;
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

  /**
   * 为指定标签创建一个 PTY 会话并挂到该标签上。
   * xterm 实例由调用方通过 pool 管理，本函数仅负责 PTY 创建。
   */
  const attachSession = useCallback(
    async (
      tabId: string,
      profile: TerminalProfile,
      workspaceId: string,
      options?: { cwdOverride?: string; revived?: boolean },
    ): Promise<void> => {
      const cwdOverride = options?.cwdOverride;
      const workspace = workspaceId
        ? recentWorkspaces.find((w) => w.id === workspaceId)
        : undefined;
      ensureTabCwdsLoaded();
      const cwd = cwdOverride ?? (workspaceId ? (workspace?.path ?? undefined) : undefined);

      try {
        // 等待容器出现：React batching 可能导致 XtermTerminal 尚未 mount，
        // document.querySelector 返回 null。轮询最多等 30 帧（~500ms）。
        let container: HTMLElement | null = null;
        for (let frame = 0; frame < 30; frame++) {
          container = document.querySelector('.adl-terminal-canvas');
          if (container) {
            break;
          }
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }

        let cols = 80;
        let rows = 24;
        if (container) {
          // 直接测量容器尺寸，不创建临时 pool entry
          // （临时 entry 会导致 DOM 中有两个重叠的 hostEl，干扰布局）
          const tempDiv = document.createElement('div');
          tempDiv.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;visibility:hidden;';
          container.appendChild(tempDiv);

          const { Terminal } = await import('@xterm/xterm');
          const { FitAddon } = await import('@xterm/addon-fit');
          const tempTerminal = new Terminal({
            fontSize: 13,
            fontFamily:
              getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() ||
              'Cascadia Code, Fira Code, Consolas, monospace',
            rows: 24,
            cols: 80,
          });
          const tempFit = new FitAddon();
          tempTerminal.loadAddon(tempFit);
          tempTerminal.open(tempDiv);
          tempFit.fit();
          const dims = tempFit.proposeDimensions();
          console.log(
            `[ADL-DEBUG] attachSession dims — container=${container.clientWidth}x${container.clientHeight} dims=${dims ? `${dims.cols}x${dims.rows}` : 'null'}`,
          );
          if (dims && dims.cols > 0 && dims.rows > 0) {
            cols = dims.cols;
            rows = dims.rows;
          }
          tempTerminal.dispose();
          tempDiv.remove();
        }

        const result = await window.digitalLife.pty.create({
          shell: SHELL_MAP[profile],
          cwd,
          cols,
          rows,
        });
        if (!result.ok) {
          const errorMsg = result.error?.message || 'Unknown error';
          console.error('Terminal creation failed:', errorMsg);
          terminalUpdateTab(tabId, { status: 'terminated' });
          // Display error in a temporary xterm so the user sees feedback
          const errContainer = document.querySelector('.adl-terminal-canvas');
          if (errContainer) {
            const errEntry = terminalXtermPool.acquire('__error__', errContainer as HTMLDivElement);
            errEntry.terminal.write(
              `\r\n\x1b[31mError: Failed to start ${profile} terminal.\x1b[0m\r\n`,
            );
            errEntry.terminal.write(`\x1b[31m${errorMsg}\x1b[0m\r\n\r\n`);
            if (profile === 'bash') {
              errEntry.terminal.write(
                '\x1b[33mHint: Make sure Git for Windows or WSL is installed.\x1b[0m\r\n',
              );
            }
            terminalXtermPool.release('__error__');
          }
          return;
        }

        const sessionId = result.data.sessionId;
        createdSessionIdsRef.current.add(sessionId);
        liveSessionIdsRef.current.add(sessionId);
        ptyDimsRef.current.set(sessionId, { cols, rows });
        terminalUpdateTab(tabId, { sessionId, status: 'running' });

        // 记录 PTY 创建时间：启动窗口内过滤清屏序列，保护历史内容
        if (options?.revived) {
          ptyCreatedAtRef.current.set(sessionId, Date.now());
        }
      } catch (err) {
        console.error('Terminal creation error:', err);
        terminalUpdateTab(tabId, { status: 'terminated' });
        const errContainer = document.querySelector('.adl-terminal-canvas');
        if (errContainer) {
          const errEntry = terminalXtermPool.acquire('__error__', errContainer as HTMLDivElement);
          errEntry.terminal.write(
            `\r\n\x1b[31mError: Failed to start ${profile} terminal.\x1b[0m\r\n`,
          );
          errEntry.terminal.write(
            `\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n\r\n`,
          );
          terminalXtermPool.release('__error__');
        }
      }
    },
    [ensureTabCwdsLoaded, recentWorkspaces, terminalUpdateTab],
  );

  /**
   * 激活某个标签：从 pool 获取 xterm，加载持久化输出并写入；
   * 若该标签持有的 PTY 会话已不存在（重启后恢复），则创建新 PTY。
   */
  const activateTab = useCallback(
    async (tabId: string): Promise<void> => {
      const tab = useAppStore.getState().terminalTabs.find((t) => t.id === tabId);
      const sessionId = tab?.sessionId;
      if (!tab || !sessionId) {
        return;
      }
      const isLive = liveSessionIdsRef.current.has(sessionId);

      if (isLive) {
        // PTY 存活：pool entry 已有完整 buffer（PTY 输出持续写入），
        // 只需 fit 和 focus
        const pooled = terminalXtermPool.get(sessionId);
        if (pooled) {
          pooled.fitAddon.fit();
          pooled.terminal.focus();
        }
        return;
      }

      // PTY 已死亡（应用重启后的恢复标签）：
      // 直接创建新 PTY，不写入持久化输出。
      // 持久化输出包含前一次会话的启动 banner，重启后新 PTY 也会输出自己的 banner，
      // 两份 banner 叠加导致显示错乱。新 PTY 自然显示当前 shell 状态。
      ensureTabCwdsLoaded();
      const rememberedCwd = tabCwdRef.current.get(tabId);
      await attachSession(tabId, tab.profile, tab.workspaceId, {
        cwdOverride: rememberedCwd,
        revived: true,
      });

      // 补发 PTY 创建前缓冲的输入
      const pending = pendingInputRef.current;
      pendingInputRef.current = '';
      const newSessionId = useAppStore
        .getState()
        .terminalTabs.find((t) => t.id === tabId)?.sessionId;
      if (pending && newSessionId) {
        window.digitalLife.pty.input(newSessionId, pending);
      }
    },
    [attachSession, ensureTabCwdsLoaded],
  );

  // 全量预热：标签集合（含会话）就绪后，后台并行加载所有会话的持久化输出。
  // 依赖 sessionIdsKey，因此即使 store 水合晚于本组件挂载（初始 terminalTabs 为空），
  // 也会在标签出现后补加载。
  useEffect(() => {
    const sessionIds = sessionIdsKey ? sessionIdsKey.split('|') : [];
    if (sessionIds.length === 0) {
      return;
    }
    for (const sessionId of sessionIds) {
      void ensureLoaded(sessionId);
    }
  }, [sessionIdsKey, ensureLoaded]);

  useEffect(() => {
    const interval = setInterval(() => {
      const sessionIds = sessionIdsKey ? sessionIdsKey.split('|') : [];
      for (const sessionId of sessionIds) {
        serializeSession(sessionId);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [sessionIdsKey, serializeSession]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const sessionIds = sessionIdsKey ? sessionIdsKey.split('|') : [];
      for (const sessionId of sessionIds) {
        serializeSession(sessionId);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionIdsKey, serializeSession]);

  // 启动激活：恢复的标签其会话必然已不存在（应用退出时会话被 kill），
  // 因此在启动时对「上一次运行遗留的活动标签」走一次激活（回放历史 + 重建会话）。
  const startupHandledRef = useRef(false);
  useEffect(() => {
    if (startupHandledRef.current) {
      return;
    }
    const tabId = activeTab?.id;
    const sessionId = activeTab?.sessionId;
    if (!tabId || !sessionId) {
      return;
    }
    startupHandledRef.current = true;
    if (createdSessionIdsRef.current.has(sessionId)) {
      return;
    }
    void activateTab(tabId);
  }, [activeTab, activateTab]);

  const handleXtermData = useCallback(
    (data: string) => {
      const tab = activeTab;
      const sessionId = tab?.sessionId;
      if (!tab || !sessionId) {
        return;
      }
      if (!liveSessionIdsRef.current.has(sessionId)) {
        // PTY 尚未创建（重启后恢复的标签）：缓冲输入，触发激活
        pendingInputRef.current += data;
        void activateTab(tab.id);
        return;
      }
      window.digitalLife.pty.input(sessionId, data);
    },
    [activeTab, activateTab],
  );

  const handleXtermResize = useCallback(
    (cols: number, rows: number) => {
      const targetSession = activeTab?.sessionId;
      if (!targetSession || !liveSessionIdsRef.current.has(targetSession)) {
        return;
      }
      const effective = ptyDimsRef.current.get(targetSession);
      if (effective && effective.cols === cols && effective.rows === rows) {
        return;
      }
      ptyDimsRef.current.set(targetSession, { cols, rows });
      window.digitalLife.pty.resize(targetSession, cols, rows);
    },
    [activeTab?.sessionId],
  );

  const handleCreateTab = useCallback(
    async (profile?: TerminalProfile, workspaceId?: string) => {
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

      terminalCreateTab(finalProfile, workspaceId ?? '');
      const createdTabId = useAppStore.getState().terminalActiveTabId;
      // attachSession now measures dimensions directly via a temporary pool entry,
      // so no setTimeout or waitForTerminal is needed here.
      await attachSession(createdTabId, finalProfile, workspaceId ?? '');
    },
    [attachSession, terminalCreateTab],
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      const currentActiveTabId = useAppStore.getState().terminalActiveTabId;
      if (tabId === currentActiveTabId) {
        return;
      }
      terminalSelectTab(tabId);
      void activateTab(tabId);
    },
    [activateTab, terminalSelectTab],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tabs = useAppStore.getState().terminalTabs;
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        window.digitalLife.pty.kill(tab.sessionId);
        terminalXtermPool.release(tab.sessionId);
        liveSessionIdsRef.current.delete(tab.sessionId);
        createdSessionIdsRef.current.delete(tab.sessionId);
        ptyCreatedAtRef.current.delete(tab.sessionId);
        oscCarryRef.current.delete(tab.sessionId);
        sessionOutputsRef.current.delete(tab.sessionId);
        loadedSessionIdsRef.current.delete(tab.sessionId);
        loadPromisesRef.current.delete(tab.sessionId);
        terminalOutputStore.delete(tab.sessionId);
      }
      if (tabCwdRef.current.delete(tabId)) {
        persistTabCwds();
      }
      terminalCloseTab(tabId);
    },
    [persistTabCwds, terminalCloseTab],
  );

  const handleCloseAllTabs = useCallback(
    (workspaceId?: string) => {
      const tabs = useAppStore.getState().terminalTabs;
      const tabsToClose =
        workspaceId !== undefined ? tabs.filter((tab) => tab.workspaceId === workspaceId) : tabs;
      tabsToClose.forEach((tab) => {
        if (tab.sessionId) {
          window.digitalLife.pty.kill(tab.sessionId);
          terminalXtermPool.release(tab.sessionId);
          liveSessionIdsRef.current.delete(tab.sessionId);
          ptyDimsRef.current.delete(tab.sessionId);
          createdSessionIdsRef.current.delete(tab.sessionId);
          ptyCreatedAtRef.current.delete(tab.sessionId);
          sessionOutputsRef.current.delete(tab.sessionId);
          loadedSessionIdsRef.current.delete(tab.sessionId);
          loadPromisesRef.current.delete(tab.sessionId);
          terminalOutputStore.delete(tab.sessionId);
        }
      });
      terminalCloseAllTabs(workspaceId);
    },
    [terminalCloseAllTabs],
  );

  const handleKill = useCallback(() => {
    const sessionId = activeTab?.sessionId;
    if (sessionId) {
      window.digitalLife.pty.kill(sessionId);
      liveSessionIdsRef.current.delete(sessionId);
      terminalUpdateActiveTab({ status: 'terminated' });
    }
  }, [activeTab?.sessionId, terminalUpdateActiveTab]);

  useEffect(() => {
    if (activeRightTool !== 'terminal') {
      return;
    }

    const unsub = window.digitalLife.subscribePtyOutput((event) => {
      if (event.terminated) {
        liveSessionIdsRef.current.delete(event.sessionId);
        ptyDimsRef.current.delete(event.sessionId);
        const tabs = useAppStore.getState().terminalTabs;
        const tab = tabs.find((t) => t.sessionId === event.sessionId);
        if (tab) {
          terminalUpdateTab(tab.id, { status: 'terminated' });
        }
        return;
      }

      const data = event.data;

      // 启动窗口内过滤 shell 清屏/scrollback 清除/光标归位序列，
      // 保护已写入的历史内容，同时确保持久化输出不含这些序列。
      const createdAt = ptyCreatedAtRef.current.get(event.sessionId);
      const inStartupWindow = createdAt !== undefined && Date.now() - createdAt < STARTUP_WINDOW_MS;
      // eslint-disable-next-line no-control-regex
      const filteredData = inStartupWindow ? data.replace(/\x1b\[(?:2J|3J|H|1;1H)/g, '') : data;

      // OSC 9;9: 按标签记住 shell 上报的当前目录
      const oscScan = scanOsc99((oscCarryRef.current.get(event.sessionId) ?? '') + event.data);
      if (oscScan.carry) {
        oscCarryRef.current.set(event.sessionId, oscScan.carry);
      } else {
        oscCarryRef.current.delete(event.sessionId);
      }
      if (oscScan.cwds.length > 0) {
        const ownerTab = useAppStore
          .getState()
          .terminalTabs.find((t) => t.sessionId === event.sessionId);
        if (ownerTab) {
          const latestCwd = oscScan.cwds[oscScan.cwds.length - 1];
          const normalized = normalizeReportedCwd(latestCwd, { msys: ownerTab.profile === 'bash' });
          if (normalized && tabCwdRef.current.get(ownerTab.id) !== normalized) {
            tabCwdRef.current.set(ownerTab.id, normalized);
            persistTabCwds();
          }
        }
      }

      // 累积过滤后的输出到内存缓冲（用于持久化保存）
      const outputs = sessionOutputsRef.current;
      let previous = outputs.get(event.sessionId) ?? '';
      previous += filteredData;
      if (previous.length > MAX_SESSION_OUTPUT_BYTES) {
        previous = previous.slice(previous.length - MAX_SESSION_OUTPUT_BYTES);
      }
      outputs.set(event.sessionId, previous);

      // 写入 pool 中该会话的 xterm（所有会话，不仅限活动标签）
      const pooled = terminalXtermPool.get(event.sessionId);
      if (pooled) {
        pooled.terminal.write(filteredData);
      } else {
        console.log(
          `[ADL-DEBUG] pty output dropped (no pool entry) — session=${event.sessionId} bytes=${filteredData.length} poolSize=${terminalXtermPool.size}`,
        );
      }

      // 防抖保存：合并高频输出事件，每 500ms 最多写入一次持久化存储
      const existing = saveDebounceRef.current.get(event.sessionId);
      if (existing) {
        clearTimeout(existing);
      }
      saveDebounceRef.current.set(
        event.sessionId,
        setTimeout(() => {
          saveDebounceRef.current.delete(event.sessionId);
          serializeSession(event.sessionId);
        }, 500),
      );
    });
    return () => unsub();
  }, [activeRightTool, persistTabCwds, serializeSession, terminalUpdateTab]);

  useEffect(() => {
    const container = document.querySelector('.adl-tool-primary__scroll--terminal');
    if (!container) {
      return;
    }

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) {
        return;
      }

      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        terminalXtermPool.fitAll();
      }, 150);
    });

    observer.observe(container);
    return () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      observer.disconnect();
    };
  }, []);

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
