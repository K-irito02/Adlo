import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { terminalSelectors } from '@stores/selectors';
import type { TerminalProfile } from '@stores/types';
import type { XtermTerminalHandle } from '@components/terminal/XtermTerminal';
import { terminalOutputStore } from './terminalOutputStore';
import { normalizeReportedCwd, scanOsc99 } from './terminalCwdOsc';
import { terminalCwdStore } from './terminalCwdStore';
import { terminalXtermPool, readTerminalFontFamily } from './terminalXtermPool';
import {
  MAX_HISTORY_SEGMENTS,
  terminalHistoryStore,
  type TerminalHistorySegment,
} from './terminalHistoryStore';

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
  const saveDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // 本次运行中新建的会话（用于区分「重启恢复的标签」与「新建标签」）
  const createdSessionIdsRef = useRef<Set<string>>(new Set());
  // 当前仍然存活的 PTY 会话（应用重启后恢复的标签不在其中 → 需要重建）
  const liveSessionIdsRef = useRef<Set<string>>(new Set());
  // 重建期间缓冲的用户输入（PTY 创建前收到的按键，PTY 就绪后补发）。
  // 按「标签」隔离：并发激活多个标签时，各标签的按键不得串到别的标签。
  const pendingInputRef = useRef<Map<string, string>>(new Map());
  // 每个标签「正在进行的激活」：并发触发（启动效应 + 键入补触发 + 聚焦上报）必须汇流成一次，
  // 否则会为同一标签创建多个 PTY（已被日志证实过）。
  const activatingRef = useRef<Map<string, Promise<void>>>(new Map());
  // 每个会话当前实际生效的 PTY 尺寸：同尺寸的 resize 直接跳过，
  // 否则 ConPTY 每次都会重发整屏（约 250 字节的 `\x1b[K\r\n` 片段）污染输出缓冲。
  const ptyDimsRef = useRef<Map<string, { cols: number; rows: number }>>(new Map());
  // 每个标签的「上次所在目录」（由 shell 通过 OSC 9;9 上报，按标签持久化）
  const tabCwdRef = useRef<Map<string, string>>(new Map());
  const tabCwdsLoadedRef = useRef(false);
  // OSC 9;9 可能跨块截断：保留各会话的尾部片段用于拼接
  const oscCarryRef = useRef<Map<string, string>>(new Map());
  // 每个标签的「历史分段索引」：历次 PTY 会话的 sessionId（旧 → 新）。
  // 历史内容按 sessionId 由 terminalOutputStore 保存，这里只管顺序与归档时间。
  const historyIndexRef = useRef<Map<string, TerminalHistorySegment[]>>(new Map());
  const historyIndexLoadedRef = useRef(false);
  // 索引是 ref（便于在回调里同步读写），用一个版本号驱动渲染
  const [historyIndexVersion, setHistoryIndexVersion] = useState(0);

  /** 懒加载持久化的「标签 → 历史分段」索引（只需一次） */
  const ensureHistoryIndexLoaded = useCallback(() => {
    if (historyIndexLoadedRef.current) {
      return;
    }
    historyIndexLoadedRef.current = true;
    for (const [tabId, segments] of Object.entries(terminalHistoryStore.loadAll())) {
      historyIndexRef.current.set(tabId, segments);
    }
  }, []);

  /** 持久化整个「标签 → 历史分段」索引，并触发一次渲染 */
  const persistHistoryIndex = useCallback(() => {
    const snapshot: Record<string, TerminalHistorySegment[]> = {};
    historyIndexRef.current.forEach((segments, tabId) => {
      snapshot[tabId] = segments;
    });
    terminalHistoryStore.saveAll(snapshot);
    setHistoryIndexVersion((v) => v + 1);
  }, []);

  /**
   * 把某标签当前的（即将失效的）会话归档为一段历史。
   * 只在真正需要重建会话时调用；裁剪掉的最旧段连同其快照一并删除。
   */
  const archiveSessionAsHistory = useCallback(
    (tabId: string, sessionId: string) => {
      ensureHistoryIndexLoaded();
      const segments = historyIndexRef.current.get(tabId) ?? [];
      if (segments.some((segment) => segment.sessionId === sessionId)) {
        return;
      }
      const next = [...segments, { sessionId, archivedAt: Date.now() }];
      const dropped = next.slice(0, Math.max(0, next.length - MAX_HISTORY_SEGMENTS));
      for (const segment of dropped) {
        void terminalOutputStore.delete(segment.sessionId);
      }
      historyIndexRef.current.set(tabId, next.slice(-MAX_HISTORY_SEGMENTS));
      persistHistoryIndex();
    },
    [ensureHistoryIndexLoaded, persistHistoryIndex],
  );

  /** 删除某标签的全部历史（关闭标签/关闭全部时调用），同时清掉各段快照 */
  const clearHistoryForTab = useCallback(
    (tabId: string) => {
      // 先确保索引已加载：否则「启动后立刻关闭上次遗留标签」时 ref 还是空的，
      // 会提前 return，持久化里的索引与各段快照就成了孤儿数据。
      ensureHistoryIndexLoaded();
      const segments = historyIndexRef.current.get(tabId);
      if (!segments) {
        return;
      }
      for (const segment of segments) {
        void terminalOutputStore.delete(segment.sessionId);
      }
      historyIndexRef.current.delete(tabId);
      persistHistoryIndex();
    },
    [ensureHistoryIndexLoaded, persistHistoryIndex],
  );

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
      // excludeAltBuffer：若退出时停在 vim/less 等备用缓冲区，快照只保留普通缓冲区内容。
      // 历史视图是按「普通缓冲区快照」顺序拼接回放的，绝不能把 \x1b[?1049h 缓冲区切换带进去。
      const state = entry.serializeAddon.serialize({
        scrollback: 1000,
        excludeAltBuffer: true,
      });
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
   * 把某会话的尺寸上报给 PTY（同尺寸去重）。
   * ConPTY 每次收到 resize 都会重发整屏，因此只有尺寸真实变化时才上报。
   */
  const applySessionSize = useCallback((sessionId: string, cols: number, rows: number) => {
    if (cols <= 0 || rows <= 0) {
      return;
    }
    const effective = ptyDimsRef.current.get(sessionId);
    if (effective && effective.cols === cols && effective.rows === rows) {
      return;
    }
    ptyDimsRef.current.set(sessionId, { cols, rows });
    window.digitalLife.pty.resize(sessionId, cols, rows);
  }, []);

  /**
   * 为指定标签创建一个 PTY 会话并挂到该标签上。
   * xterm 实例由调用方通过 pool 管理，本函数仅负责 PTY 创建。
   */
  const attachSession = useCallback(
    async (
      tabId: string,
      profile: TerminalProfile,
      workspaceId: string,
      options?: { cwdOverride?: string },
    ): Promise<void> => {
      const cwdOverride = options?.cwdOverride;
      const workspace = workspaceId
        ? recentWorkspaces.find((w) => w.id === workspaceId)
        : undefined;
      ensureTabCwdsLoaded();
      const cwd = cwdOverride ?? (workspaceId ? (workspace?.path ?? undefined) : undefined);

      // 双保险：activateTab 已用 activatingRef 汇流并发激活，这里再拦一次
      // 「该标签已有存活 PTY」的调用（attachSession 也可能被 handleCreateTab 等路径直接调用）。
      const existingTab = useAppStore.getState().terminalTabs.find((t) => t.id === tabId);
      if (!existingTab) {
        // 标签已被关闭（关闭 × 激活并发的竞态）：不再为其创建 PTY
        return;
      }
      if (existingTab.sessionId && liveSessionIdsRef.current.has(existingTab.sessionId)) {
        return;
      }

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
            fontFamily: readTerminalFontFamily(),
            rows: 24,
            cols: 80,
          });
          const tempFit = new FitAddon();
          tempTerminal.loadAddon(tempFit);
          tempTerminal.open(tempDiv);
          tempFit.fit();
          const dims = tempFit.proposeDimensions();
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
          // 失败反馈由 TerminalPanel 的 .adl-terminal-error-note 呈现
          terminalUpdateTab(tabId, { status: 'terminated' });
          return;
        }

        const sessionId = result.data.sessionId;
        // PTY 创建期间标签可能已被关闭：此时这个 PTY 已成孤儿，立即回收，
        // 不写入任何 ref / store（否则会残留一个占用 shell 进程的会话）。
        if (!useAppStore.getState().terminalTabs.some((t) => t.id === tabId)) {
          void window.digitalLife.pty.kill(sessionId);
          return;
        }
        createdSessionIdsRef.current.add(sessionId);
        liveSessionIdsRef.current.add(sessionId);
        ptyDimsRef.current.set(sessionId, { cols, rows });
        terminalUpdateTab(tabId, { sessionId, status: 'running' });
      } catch (err) {
        console.error('Terminal creation error:', err);
        // 失败反馈由 TerminalPanel 的 .adl-terminal-error-note 呈现
        terminalUpdateTab(tabId, { status: 'terminated' });
      }
    },
    [ensureTabCwdsLoaded, recentWorkspaces, terminalUpdateTab],
  );

  /**
   * 激活某个标签：会话存活则只做 fit/focus；会话已消失（应用重启后恢复的标签）则
   * 把旧会话归档为「只读历史段」、再创建一个全新的 PTY。
   *
   * 并发调用（启动效应 + 键入补触发 + 聚焦上报）会汇流到同一个 promise，
   * 保证每个标签最多只创建一个 PTY。
   */
  const activateTab = useCallback(
    (tabId: string): Promise<void> => {
      const inFlight = activatingRef.current.get(tabId);
      if (inFlight) {
        return inFlight;
      }

      const run = (async () => {
        try {
          const tab = useAppStore.getState().terminalTabs.find((t) => t.id === tabId);
          if (!tab) {
            return;
          }
          const sessionId = tab.sessionId;
          if (sessionId && liveSessionIdsRef.current.has(sessionId)) {
            // PTY 存活：pool entry 已有完整 buffer（PTY 输出持续写入），只需 fit 和 focus
            const pooled = terminalXtermPool.get(sessionId);
            if (pooled) {
              pooled.fitAddon.fit();
              pooled.terminal.focus();
            }
            return;
          }

          ensureTabCwdsLoaded();
          const rememberedCwd = tabCwdRef.current.get(tabId);

          // 旧会话已结束（或无会话）：把它归档进历史索引。历史内容仍按 sessionId
          // 存在 terminalOutputStore 里，由只读历史视图自行加载回放 —— 绝不写进实时终端，
          // 否则 ConPTY 的光标坐标系会被历史顶偏（这就是「输出跳回顶部」的根因）。
          if (sessionId) {
            archiveSessionAsHistory(tabId, sessionId);
          }

          await attachSession(tabId, tab.profile, tab.workspaceId, {
            cwdOverride: rememberedCwd,
          });

          // 补发 PTY 创建前缓冲的输入。
          // 只补发给「本次新建、且确实存活」的会话：attachSession 失败时 tab.sessionId
          // 仍是恢复前的旧（已死）会话 id，向它补发既无效又有误导性。
          const pending = pendingInputRef.current.get(tabId) ?? '';
          pendingInputRef.current.delete(tabId);
          const liveSessionId = useAppStore
            .getState()
            .terminalTabs.find((t) => t.id === tabId)?.sessionId;
          if (pending && liveSessionId && liveSessionIdsRef.current.has(liveSessionId)) {
            window.digitalLife.pty.input(liveSessionId, pending);
          }
        } catch (err) {
          console.error('Terminal activation failed:', err);
        }
      })();

      activatingRef.current.set(tabId, run);
      void run.then(() => {
        if (activatingRef.current.get(tabId) === run) {
          activatingRef.current.delete(tabId);
        }
      });
      return run;
    },
    [archiveSessionAsHistory, attachSession, ensureTabCwdsLoaded],
  );

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
  // 因此在启动时对「上一次运行遗留的活动标签」走一次激活（归档历史 + 重建会话）。
  const startupHandledRef = useRef(false);
  useEffect(() => {
    if (startupHandledRef.current) {
      return;
    }
    const tabId = activeTab?.id;
    if (!tabId) {
      return;
    }
    startupHandledRef.current = true;
    const sessionId = activeTab?.sessionId;
    // 本次运行已建过的会话无需再激活；无会话的标签（例如上次建会话中途退出）也要补建
    if (sessionId && createdSessionIdsRef.current.has(sessionId)) {
      return;
    }
    void activateTab(tabId);
  }, [activeTab, activateTab]);

  const handleXtermData = useCallback(
    (data: string) => {
      const tab = activeTab;
      if (!tab) {
        return;
      }
      const sessionId = tab.sessionId;
      if (!sessionId || !liveSessionIdsRef.current.has(sessionId)) {
        // PTY 尚未就绪：缓冲输入并触发激活。
        // xterm 在获得/失去焦点时会自动上报 \x1b[I / \x1b[O（shell 请求的 focus reporting），
        // 那不是用户输入，不该混进待补发内容。
        // eslint-disable-next-line no-control-regex
        const userInput = data.replace(/\x1b\[[IO]/g, '');
        if (userInput) {
          const buffered = pendingInputRef.current.get(tab.id) ?? '';
          pendingInputRef.current.set(tab.id, buffered + userInput);
        }
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
      applySessionSize(targetSession, cols, rows);
    },
    [activeTab?.sessionId, applySessionSize],
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
        ptyDimsRef.current.delete(tab.sessionId);
        createdSessionIdsRef.current.delete(tab.sessionId);
        oscCarryRef.current.delete(tab.sessionId);
        terminalOutputStore.delete(tab.sessionId);
      }
      // 历史与待发输入的清理不依赖 sessionId 是否存在（与 handleCloseAllTabs 保持对称），
      // 避免「有历史却无存活会话」的边界（如 PTY 创建失败前已归档）留下孤儿索引与快照。
      pendingInputRef.current.delete(tabId);
      clearHistoryForTab(tabId);
      if (tabCwdRef.current.delete(tabId)) {
        persistTabCwds();
      }
      terminalCloseTab(tabId);
    },
    [clearHistoryForTab, persistTabCwds, terminalCloseTab],
  );

  const handleCloseAllTabs = useCallback(
    (workspaceId?: string) => {
      const tabs = useAppStore.getState().terminalTabs;
      const tabsToClose =
        workspaceId !== undefined ? tabs.filter((tab) => tab.workspaceId === workspaceId) : tabs;
      tabsToClose.forEach((tab) => {
        clearHistoryForTab(tab.id);
        tabCwdRef.current.delete(tab.id);
        pendingInputRef.current.delete(tab.id);
        if (tab.sessionId) {
          window.digitalLife.pty.kill(tab.sessionId);
          terminalXtermPool.release(tab.sessionId);
          liveSessionIdsRef.current.delete(tab.sessionId);
          ptyDimsRef.current.delete(tab.sessionId);
          createdSessionIdsRef.current.delete(tab.sessionId);
          oscCarryRef.current.delete(tab.sessionId);
          terminalOutputStore.delete(tab.sessionId);
        }
      });
      persistTabCwds();
      terminalCloseAllTabs(workspaceId);
    },
    [clearHistoryForTab, persistTabCwds, terminalCloseAllTabs],
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

      // 原样写入 pool 中该会话的 xterm（所有会话，不仅限活动标签）。
      // 不再做任何 ANSI 过滤：实时终端里只有本次会话的内容，ConPTY 的光标坐标系
      // 与 xterm 完全一致，清屏/归位/绝对定位全部可以正常放行。
      const pooled = terminalXtermPool.get(event.sessionId);
      if (pooled) {
        pooled.terminal.write(event.data);
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
    const observer = new MutationObserver(() => {
      terminalXtermPool.syncTheme();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  /** 当前活动标签的「只读历史段」列表（旧 → 新）；没有历史时为空数组 */
  const historySegments = useMemo(() => {
    const tabId = activeTab?.id;
    if (!tabId) {
      return [];
    }
    ensureHistoryIndexLoaded();
    return historyIndexRef.current.get(tabId) ?? [];
    // historyIndexVersion 只是「索引已变化」的渲染触发器，本身不参与计算：
    // 索引存在 ref 里以便在回调中同步读写，这里靠版本号驱动重新取值。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, historyIndexVersion, ensureHistoryIndexLoaded]);

  return {
    xtermRef,
    historySegments,
    handleXtermData,
    handleXtermResize,
    handleCreateTab,
    handleSelectTab,
    handleCloseTab,
    handleCloseAllTabs,
    handleKill,
  };
}
