import { useAppStore } from '@stores/slicedStore';
import type { TerminalProfile } from '@stores/types';
import { activePaneOf } from '@stores/slices/terminalSliceTypes';
import { normalizeReportedCwd, scanOsc99 } from './terminalCwdOsc';
import { terminalCwdStore } from './terminalCwdStore';
import { terminalXtermPool, readTerminalFontFamily, TERMINAL_FONT_SIZE } from './terminalXtermPool';
import { flushCrossSliceWrites } from '@stores/storageHelpers';

const SHELL_MAP: Record<TerminalProfile, string> = {
  powershell: 'powershell',
  bash: 'bash',
  cmd: 'cmd',
};

/**
 * 按**窗格身份**在其宿主容器内查找实时终端画布。
 *
 * 一个标签可含多个窗格，`.adl-terminal-canvas` 在页面里可能有多个；只有按
 * 窗格 id 限定宿主（`TerminalPaneView` 在窗格容器上写 `data-pane-id`）才能量到
 * 正确的容器尺寸。
 */
export function findPaneCanvas(paneId: string): Element | null {
  return document.querySelector(`[data-pane-id="${CSS.escape(paneId)}"] .adl-terminal-canvas`);
}

/**
 * 批量关闭时选出应清理的标签：限定工作区（可选）且**跳过中心标签**。
 * 中心标签的 PTY / xterm 池由中心宿主自行管理，不受面板批量关闭影响。
 */
export function selectTerminalTabsToClose<
  T extends { workspaceId?: string; location?: 'panel' | 'center' },
>(tabs: T[], workspaceId?: string): T[] {
  const scoped =
    workspaceId !== undefined ? tabs.filter((tab) => tab.workspaceId === workspaceId) : tabs;
  return scoped.filter((tab) => tab.location !== 'center');
}

/** 视图侧转发输入 / 缩放 / kill 时携带的窗格身份。 */
export interface PaneRef {
  tabId: string;
  paneId: string;
  sessionId?: string;
}

/**
 * 终端 PTY「运行时」——**应用级单例**。
 *
 * 为什么必须是单例：输出订阅与 beforeunload 都是与「哪个视图正在渲染」无关的全局工作。
 * 右面板与中心会各挂载一次 `useTerminalPtyLifecycle`；若这些全局工作按实例各做一遍，
 * 就会输出双写。因此把所有跨实例共享状态与全局副作用收敛到本单例，实例只负责
 * 「渲染 xterm + 转发输入 + 触发激活」。
 *
 * 所有共享状态（live/created session、pendingInput、activating、ptyDims、tabCwds、
 * oscCarry）都由本类拥有；全局回调只读写这里的字段，第二个实例不再持有空 refs。
 *
 * 身份：PTY 会话按**窗格**（`paneId`）归属；`pendingInput` / `activating` 以 paneId 为键。
 */
export class TerminalPtyRuntime {
  /** 本次运行中新建的会话（用于区分「重启恢复的标签」与「新建标签」） */
  private createdSessionIds = new Set<string>();
  /** 当前仍然存活的 PTY 会话（应用重启后恢复的标签不在其中 → 需要重建） */
  private liveSessionIds = new Set<string>();
  /** paneId → 重建期间缓冲的用户输入（PTY 就绪后补发） */
  private pendingInput = new Map<string, string>();
  /** paneId → 进行中的激活 promise（并发激活汇流成一次） */
  private activating = new Map<string, Promise<void>>();
  /** sessionId → 已上报 PTY 的尺寸（同尺寸 resize 去重） */
  private ptyDims = new Map<string, { cols: number; rows: number }>();
  /** tabId → 上次所在目录（OSC 9;9 上报，按标签持久化） */
  private tabCwds = new Map<string, string>();
  private tabCwdsLoaded = false;
  /** sessionId → OSC 9;9 跨块尾部片段 */
  private oscCarry = new Map<string, string>();

  // 全局副作用只启动一次
  private started = false;
  private unsubPtyOutput: (() => void) | null = null;
  private beforeUnloadHandler: (() => void) | null = null;

  isCreatedSession = (sessionId: string): boolean => this.createdSessionIds.has(sessionId);

  hasLiveSession = (sessionId: string): boolean => this.liveSessionIds.has(sessionId);

  // ---------------------------------------------------------------- 全局副作用启动

  ensureStarted = (): void => {
    if (this.started) {
      return;
    }
    this.started = true;
    this.startOutputSubscription();
    this.startBeforeUnload();
  };

  private startOutputSubscription = (): void => {
    if (this.unsubPtyOutput || !window.digitalLife?.subscribePtyOutput) {
      return;
    }
    const unsub = window.digitalLife.subscribePtyOutput((event) => {
      if (event.terminated) {
        this.liveSessionIds.delete(event.sessionId);
        this.ptyDims.delete(event.sessionId);
        const state = useAppStore.getState();
        for (const tab of state.terminalTabs) {
          const pane = tab.panes.find((p) => p.sessionId === event.sessionId);
          if (pane) {
            state.terminalUpdatePane(tab.id, pane.id, { status: 'terminated' });
            break;
          }
        }
        return;
      }

      // OSC 9;9: 按标签记住 shell 上报的当前目录
      const oscScan = scanOsc99((this.oscCarry.get(event.sessionId) ?? '') + event.data);
      if (oscScan.carry) {
        this.oscCarry.set(event.sessionId, oscScan.carry);
      } else {
        this.oscCarry.delete(event.sessionId);
      }
      if (oscScan.cwds.length > 0) {
        const ownerTab = useAppStore
          .getState()
          .terminalTabs.find((t) => t.panes.some((p) => p.sessionId === event.sessionId));
        if (ownerTab) {
          const ownerPane = ownerTab.panes.find((p) => p.sessionId === event.sessionId);
          const latestCwd = oscScan.cwds[oscScan.cwds.length - 1];
          const normalized = normalizeReportedCwd(latestCwd, {
            msys: ownerPane?.profile === 'bash',
          });
          if (normalized && this.tabCwds.get(ownerTab.id) !== normalized) {
            this.tabCwds.set(ownerTab.id, normalized);
            this.persistTabCwds();
          }
        }
      }

      // 原样写入 pool 中该会话的 xterm（所有会话，不仅限活动标签）。
      // 单例保证这里对每个输出事件只写一次。
      const pooled = terminalXtermPool.get(event.sessionId);
      if (pooled) {
        pooled.terminal.write(event.data);
      }
    });
    this.unsubPtyOutput = unsub;
  };

  private startBeforeUnload = (): void => {
    if (this.beforeUnloadHandler) {
      return;
    }
    this.beforeUnloadHandler = () => {
      // 同步落盘去抖中的 localStorage 写入（标签等），否则重启后丢失。
      flushCrossSliceWrites();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  };

  /** 停止全局副作用并清空共享状态（仅供测试隔离使用） */
  reset = (): void => {
    this.unsubPtyOutput?.();
    this.unsubPtyOutput = null;
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
    this.started = false;
    this.createdSessionIds.clear();
    this.liveSessionIds.clear();
    this.pendingInput.clear();
    this.activating.clear();
    this.ptyDims.clear();
    this.tabCwds.clear();
    this.tabCwdsLoaded = false;
    this.oscCarry.clear();
  };

  // ---------------------------------------------------------------- 目录

  private ensureTabCwdsLoaded = (): void => {
    if (this.tabCwdsLoaded) {
      return;
    }
    this.tabCwdsLoaded = true;
    const stored = terminalCwdStore.loadAll();
    for (const [tabId, cwd] of Object.entries(stored)) {
      this.tabCwds.set(tabId, cwd);
    }
  };

  private persistTabCwds = (): void => {
    const snapshot: Record<string, string> = {};
    this.tabCwds.forEach((cwd, tabId) => {
      snapshot[tabId] = cwd;
    });
    terminalCwdStore.saveAll(snapshot);
  };

  // ---------------------------------------------------------------- PTY 会话

  private applySessionSize = (sessionId: string, cols: number, rows: number): void => {
    if (cols <= 0 || rows <= 0) {
      return;
    }
    const effective = this.ptyDims.get(sessionId);
    if (effective && effective.cols === cols && effective.rows === rows) {
      return;
    }
    this.ptyDims.set(sessionId, { cols, rows });
    window.digitalLife.pty.resize(sessionId, cols, rows);
  };

  /**
   * 拆解单个窗格的会话资源：kill PTY、释放 xterm 池、清空运行时账本与缓冲输入。
   * 关闭窗格 / 关闭标签 / 批量关闭共用这一条出口。
   */
  private teardownPane = (
    paneId: string,
    sessionId: string | undefined,
    logLabel: string,
  ): void => {
    this.pendingInput.delete(paneId);
    if (!sessionId) {
      return;
    }
    // kill 失败仅日志：关闭流程（store / xterm 池）不受影响。
    void window.digitalLife.pty
      .kill(sessionId)
      .catch((e) => console.warn(`[pty] kill ${logLabel} failed:`, e));
    terminalXtermPool.release(sessionId);
    this.liveSessionIds.delete(sessionId);
    this.ptyDims.delete(sessionId);
    this.createdSessionIds.delete(sessionId);
    this.oscCarry.delete(sessionId);
  };

  private attachSession = async (
    tabId: string,
    paneId: string,
    profile: TerminalProfile,
    workspaceId: string,
    options?: { cwdOverride?: string },
  ): Promise<void> => {
    const cwdOverride = options?.cwdOverride;
    const recentWorkspaces = useAppStore.getState().recentWorkspaces;
    const workspace = workspaceId ? recentWorkspaces.find((w) => w.id === workspaceId) : undefined;
    this.ensureTabCwdsLoaded();
    const cwd = cwdOverride ?? (workspaceId ? (workspace?.path ?? undefined) : undefined);

    // 双保险：activatePane 已用 activating Map 汇流并发激活，这里再拦一次
    // 「该窗格已有存活 PTY」的调用。attachSession 现由 activatePane 唯一调用
    // （handleCreateTab / handleCreatePane 也都经 activatePane 收口）。
    const existingTab = useAppStore.getState().terminalTabsById[tabId];
    if (!existingTab) {
      return;
    }
    const existingPane = existingTab.panes.find((p) => p.id === paneId);
    if (!existingPane) {
      return;
    }
    if (existingPane.sessionId && this.liveSessionIds.has(existingPane.sessionId)) {
      return;
    }

    try {
      // 等待容器出现且完成布局：React batching 可能导致 XtermTerminal 尚未 mount
      // （querySelector 返回 null），或已挂载但尚未布局（零尺寸，量出的列数极小）。
      // 帧数 + 墙钟双上限：面板隐藏/窗口最小化时 rAF 会被节流甚至暂停。
      const deadline = performance.now() + 1000;
      // 一个标签可含多个窗格，页面里可能有多个 `.adl-terminal-canvas`；按窗格身份
      // （data-pane-id 宿主）限定后再查，避免量错容器导致初始 cols/rows 偏差。
      let container: HTMLElement | null = null;
      for (let frame = 0; frame < 60; frame++) {
        const candidate = findPaneCanvas(paneId);
        if (
          candidate instanceof HTMLElement &&
          candidate.clientWidth > 0 &&
          candidate.clientHeight > 0
        ) {
          container = candidate;
          break;
        }
        if (performance.now() >= deadline) {
          break;
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 100);
          requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }

      let cols = 80;
      let rows = 24;
      if (container) {
        // 直接测量容器尺寸，不创建临时 pool entry（临时 entry 会导致 DOM 中有两个
        // 重叠的 hostEl，干扰布局）。
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText =
          'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;visibility:hidden;';
        container.appendChild(tempDiv);

        const { Terminal } = await import('@xterm/xterm');
        const { FitAddon } = await import('@xterm/addon-fit');
        const tempTerminal = new Terminal({
          fontSize: TERMINAL_FONT_SIZE,
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
        useAppStore.getState().terminalUpdatePane(tabId, paneId, { status: 'terminated' });
        return;
      }

      const sessionId = result.data.sessionId;
      // PTY 创建期间窗格（或其标签）可能已被关闭：此时这个 PTY 已成孤儿，立即回收。
      const paneStillExists = useAppStore
        .getState()
        .terminalTabsById[tabId]?.panes.some((p) => p.id === paneId);
      if (!paneStillExists) {
        void window.digitalLife.pty.kill(sessionId);
        return;
      }
      this.createdSessionIds.add(sessionId);
      this.liveSessionIds.add(sessionId);
      this.ptyDims.set(sessionId, { cols, rows });
      // 出生尺寸同步给池：XtermTerminal 挂载时 acquire 消费。
      terminalXtermPool.setBirthDims(sessionId, cols, rows);
      useAppStore.getState().terminalUpdatePane(tabId, paneId, { sessionId, status: 'running' });
    } catch (err) {
      console.error('Terminal creation error:', err);
      useAppStore.getState().terminalUpdatePane(tabId, paneId, { status: 'terminated' });
    }
  };

  activatePane = (tabId: string, paneId: string): Promise<void> => {
    const inFlight = this.activating.get(paneId);
    if (inFlight) {
      return inFlight;
    }

    const run = (async () => {
      try {
        const tab = useAppStore.getState().terminalTabsById[tabId];
        if (!tab) {
          return;
        }
        const pane = tab.panes.find((p) => p.id === paneId);
        if (!pane) {
          return;
        }
        if (pane.sessionId && this.liveSessionIds.has(pane.sessionId)) {
          // PTY 存活：pool entry 已有完整 buffer，只需 fit 和 focus。
          const pooled = terminalXtermPool.get(pane.sessionId);
          if (pooled) {
            pooled.fitAddon.fit();
            pooled.terminal.focus();
          }
          return;
        }

        this.ensureTabCwdsLoaded();
        const rememberedCwd = this.tabCwds.get(tabId);

        await this.attachSession(tabId, paneId, pane.profile, tab.workspaceId, {
          cwdOverride: rememberedCwd,
        });

        // 补发 PTY 创建前缓冲的输入。只补发给「本次新建、且确实存活」的会话。
        const pending = this.pendingInput.get(paneId) ?? '';
        this.pendingInput.delete(paneId);
        const liveSessionId = useAppStore
          .getState()
          .terminalTabsById[tabId]?.panes.find((p) => p.id === paneId)?.sessionId;
        if (pending && liveSessionId && this.liveSessionIds.has(liveSessionId)) {
          window.digitalLife.pty.input(liveSessionId, pending);
        }
      } catch (err) {
        console.error('Terminal activation failed:', err);
      }
    })();

    this.activating.set(paneId, run);
    void run.then(() => {
      if (this.activating.get(paneId) === run) {
        this.activating.delete(paneId);
      }
    });
    return run;
  };

  // ---------------------------------------------------------------- 实例动作

  handleXtermData = (pane: PaneRef | undefined, data: string): void => {
    if (!pane) {
      return;
    }
    const sessionId = pane.sessionId;
    if (!sessionId || !this.liveSessionIds.has(sessionId)) {
      // PTY 尚未就绪：缓冲输入并触发激活。xterm 焦点上报的 \x1b[I/\x1b[O 不算用户输入。
      // eslint-disable-next-line no-control-regex
      const userInput = data.replace(/\x1b\[[IO]/g, '');
      if (userInput) {
        const buffered = this.pendingInput.get(pane.paneId) ?? '';
        this.pendingInput.set(pane.paneId, buffered + userInput);
      }
      void this.activatePane(pane.tabId, pane.paneId);
      return;
    }
    window.digitalLife.pty.input(sessionId, data);
  };

  handleXtermResize = (pane: PaneRef | undefined, cols: number, rows: number): void => {
    const targetSession = pane?.sessionId;
    if (!targetSession || !this.liveSessionIds.has(targetSession)) {
      return;
    }
    this.applySessionSize(targetSession, cols, rows);
  };

  /**
   * 杀死窗格进程（保留窗格本身）。
   *
   * **有意与 `teardownPane` 不同**（Ruling C-7）：`teardownPane` 用于关闭 / 移除窗格，
   * 会释放 xterm 池；而「杀死进程」后窗格仍然存在，必须**保留 xterm 池条目**（即保留
   * 最后一段输出）。否则 `XtermTerminal`（其 effect 只依赖 `[sessionId]`，且 sessionId
   * 仍留在 store）不会重新 acquire，窗格会变成没有任何状态提示的空白矩形，且与后端退出
   * （terminated 事件）路径的表现不一致。因此这里只 kill PTY、清运行时账本，不释放池、
   * 不清 `createdSessionIds`。
   */
  handleKillPane = (pane: PaneRef | undefined): void => {
    const sessionId = pane?.sessionId;
    if (!pane || !sessionId) {
      return;
    }
    void window.digitalLife.pty
      .kill(sessionId)
      .catch((e) => console.warn('[pty] kill pane failed:', e));
    this.liveSessionIds.delete(sessionId);
    this.ptyDims.delete(sessionId);
    this.oscCarry.delete(sessionId);
    // 按窗格更新：一个标签有多个窗格，必须只标记被 kill 的那个。
    useAppStore.getState().terminalUpdatePane(pane.tabId, pane.paneId, { status: 'terminated' });
  };

  handleCreatePane = async (tabId: string, profile?: TerminalProfile): Promise<void> => {
    const tab = useAppStore.getState().terminalTabsById[tabId];
    if (!tab) {
      return;
    }
    const paneId = useAppStore.getState().terminalAddPane(tabId, profile);
    if (!paneId) {
      return;
    }
    // 走 activatePane 而非直接 attachSession：视图侧激活 effect 也会对同一新窗格
    // 调用 activatePane，经其 activating 汇流避免同一窗格被创建出两个 PTY。
    await this.activatePane(tabId, paneId);
  };

  handleClosePane = (tabId: string, paneId: string): void => {
    const tab = useAppStore.getState().terminalTabsById[tabId];
    if (!tab) {
      return;
    }
    // 最后一个窗格：不再删窗格，改走「关闭整个标签」。
    if (tab.panes.length === 1) {
      this.handleCloseTab(tabId);
      return;
    }
    const pane = tab.panes.find((p) => p.id === paneId);
    if (!pane) {
      return;
    }
    this.teardownPane(paneId, pane.sessionId, 'on pane close');
    // store 内在移除活动窗格时重设 activePaneId。
    useAppStore.getState().terminalRemovePane(tabId, paneId);
  };

  handleCreateTab = async (profile?: TerminalProfile, workspaceId?: string): Promise<void> => {
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

    useAppStore.getState().terminalCreateTab(finalProfile, workspaceId ?? '');
    const createdTab =
      useAppStore.getState().terminalTabsById[useAppStore.getState().terminalActiveTabId];
    const firstPane = createdTab?.panes[0];
    if (!createdTab || !firstPane) {
      return;
    }
    // 同 handleCreatePane：经 activatePane 去重，避免与视图侧激活 effect 双建 PTY。
    await this.activatePane(createdTab.id, firstPane.id);
  };

  handleSelectPane = (tabId: string, paneId: string): void => {
    useAppStore.getState().terminalSetActivePane(tabId, paneId);
    const pane = useAppStore.getState().terminalTabsById[tabId]?.panes.find((p) => p.id === paneId);
    // 无存活会话（空白 / 已退出）时点按即重建 shell；存活会话仅切换活动态。
    if (pane && !(pane.sessionId && this.liveSessionIds.has(pane.sessionId))) {
      void this.activatePane(tabId, paneId);
    }
  };

  handleSelectTab = (tabId: string): void => {
    const currentActiveTabId = useAppStore.getState().terminalActiveTabId;
    if (tabId === currentActiveTabId) {
      return;
    }
    useAppStore.getState().terminalSelectTab(tabId);
    const tab = useAppStore.getState().terminalTabsById[tabId];
    if (!tab) {
      return;
    }
    const pane = activePaneOf(tab);
    if (pane) {
      void this.activatePane(tab.id, pane.id);
    }
  };

  handleCloseTab = (tabId: string): void => {
    const tab = useAppStore.getState().terminalTabsById[tabId];
    tab?.panes.forEach((pane) => this.teardownPane(pane.id, pane.sessionId, 'on tab close'));
    if (this.tabCwds.delete(tabId)) {
      this.persistTabCwds();
    }
    useAppStore.getState().terminalCloseTab(tabId);
  };

  handleCloseAllTabs = (workspaceId?: string): void => {
    const tabs = useAppStore.getState().terminalTabs;
    const tabsToClose = selectTerminalTabsToClose(tabs, workspaceId);
    tabsToClose.forEach((tab) => {
      this.tabCwds.delete(tab.id);
      tab.panes.forEach((pane) => this.teardownPane(pane.id, pane.sessionId, 'on close-all'));
    });
    this.persistTabCwds();
    useAppStore.getState().terminalCloseAllTabs(workspaceId);
  };
}

/** 应用级单例：所有终端 PTY 运行时状态与全局副作用的唯一归属。 */
export const terminalPtyRuntime = new TerminalPtyRuntime();
