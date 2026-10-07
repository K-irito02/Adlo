import { useAppStore } from '@stores/slicedStore';
import type { TerminalProfile } from '@stores/types';
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
 * 按标签归属（`location`）在**所属宿主**容器内查找实时终端画布。
 *
 * 面板与中心终端并存时页面里有两个 `.adl-terminal-canvas`；全局
 * `document.querySelector` 会命中 DOM 顺序靠前者，导致 attachSession 量错容器、
 * 初始 cols/rows 偏差。限定宿主后查即可消除歧义。
 */
export function findTerminalCanvasForHost(
  location: 'panel' | 'center' | undefined,
): Element | null {
  const hostSelector =
    location === 'center'
      ? '.adl-center-terminal'
      : '.adl-tool-panel--terminal:not(.adl-center-terminal)';
  return document.querySelector(hostSelector)?.querySelector('.adl-terminal-canvas') ?? null;
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

interface ActiveTerminalTab {
  id: string;
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
 */
export class TerminalPtyRuntime {
  /** 本次运行中新建的会话（用于区分「重启恢复的标签」与「新建标签」） */
  private createdSessionIds = new Set<string>();
  /** 当前仍然存活的 PTY 会话（应用重启后恢复的标签不在其中 → 需要重建） */
  private liveSessionIds = new Set<string>();
  /** tabId → 重建期间缓冲的用户输入（PTY 就绪后补发） */
  private pendingInput = new Map<string, string>();
  /** tabId → 进行中的激活 promise（并发激活汇流成一次） */
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
        const tabs = useAppStore.getState().terminalTabs;
        const tab = tabs.find((t) => t.sessionId === event.sessionId);
        if (tab) {
          useAppStore.getState().terminalUpdateTab(tab.id, { status: 'terminated' });
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
          .terminalTabs.find((t) => t.sessionId === event.sessionId);
        if (ownerTab) {
          const latestCwd = oscScan.cwds[oscScan.cwds.length - 1];
          const normalized = normalizeReportedCwd(latestCwd, { msys: ownerTab.profile === 'bash' });
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

  private attachSession = async (
    tabId: string,
    profile: TerminalProfile,
    workspaceId: string,
    options?: { cwdOverride?: string },
  ): Promise<void> => {
    const cwdOverride = options?.cwdOverride;
    const recentWorkspaces = useAppStore.getState().recentWorkspaces;
    const workspace = workspaceId ? recentWorkspaces.find((w) => w.id === workspaceId) : undefined;
    this.ensureTabCwdsLoaded();
    const cwd = cwdOverride ?? (workspaceId ? (workspace?.path ?? undefined) : undefined);

    // 双保险：activateTab 已用 activating Map 汇流并发激活，这里再拦一次
    // 「该标签已有存活 PTY」的调用（attachSession 也可能被 handleCreateTab 等路径直接调用）。
    const existingTab = useAppStore.getState().terminalTabs.find((t) => t.id === tabId);
    if (!existingTab) {
      return;
    }
    if (existingTab.sessionId && this.liveSessionIds.has(existingTab.sessionId)) {
      return;
    }

    try {
      // 等待容器出现且完成布局：React batching 可能导致 XtermTerminal 尚未 mount
      // （querySelector 返回 null），或已挂载但尚未布局（零尺寸，量出的列数极小）。
      // 帧数 + 墙钟双上限：面板隐藏/窗口最小化时 rAF 会被节流甚至暂停。
      const deadline = performance.now() + 1000;
      // 面板与中心终端并存时页面里有两个 `.adl-terminal-canvas`，全局 querySelector
      // 会量错宿主容器导致初始 cols/rows 偏差。按标签归属（location）限定到所属宿主后再查。
      let container: HTMLElement | null = null;
      for (let frame = 0; frame < 60; frame++) {
        const candidate = findTerminalCanvasForHost(existingTab.location);
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
        useAppStore.getState().terminalUpdateTab(tabId, { status: 'terminated' });
        return;
      }

      const sessionId = result.data.sessionId;
      // PTY 创建期间标签可能已被关闭：此时这个 PTY 已成孤儿，立即回收。
      if (!useAppStore.getState().terminalTabs.some((t) => t.id === tabId)) {
        void window.digitalLife.pty.kill(sessionId);
        return;
      }
      this.createdSessionIds.add(sessionId);
      this.liveSessionIds.add(sessionId);
      this.ptyDims.set(sessionId, { cols, rows });
      // 出生尺寸同步给池：XtermTerminal 挂载时 acquire 消费。
      terminalXtermPool.setBirthDims(sessionId, cols, rows);
      useAppStore.getState().terminalUpdateTab(tabId, { sessionId, status: 'running' });
    } catch (err) {
      console.error('Terminal creation error:', err);
      useAppStore.getState().terminalUpdateTab(tabId, { status: 'terminated' });
    }
  };

  activateTab = (tabId: string): Promise<void> => {
    const inFlight = this.activating.get(tabId);
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
        if (sessionId && this.liveSessionIds.has(sessionId)) {
          // PTY 存活：pool entry 已有完整 buffer，只需 fit 和 focus。
          const pooled = terminalXtermPool.get(sessionId);
          if (pooled) {
            pooled.fitAddon.fit();
            pooled.terminal.focus();
          }
          return;
        }

        this.ensureTabCwdsLoaded();
        const rememberedCwd = this.tabCwds.get(tabId);

        await this.attachSession(tabId, tab.profile, tab.workspaceId, {
          cwdOverride: rememberedCwd,
        });

        // 补发 PTY 创建前缓冲的输入。只补发给「本次新建、且确实存活」的会话。
        const pending = this.pendingInput.get(tabId) ?? '';
        this.pendingInput.delete(tabId);
        const liveSessionId = useAppStore
          .getState()
          .terminalTabs.find((t) => t.id === tabId)?.sessionId;
        if (pending && liveSessionId && this.liveSessionIds.has(liveSessionId)) {
          window.digitalLife.pty.input(liveSessionId, pending);
        }
      } catch (err) {
        console.error('Terminal activation failed:', err);
      }
    })();

    this.activating.set(tabId, run);
    void run.then(() => {
      if (this.activating.get(tabId) === run) {
        this.activating.delete(tabId);
      }
    });
    return run;
  };

  // ---------------------------------------------------------------- 实例动作

  handleXtermData = (activeTab: ActiveTerminalTab | undefined, data: string): void => {
    if (!activeTab) {
      return;
    }
    const sessionId = activeTab.sessionId;
    if (!sessionId || !this.liveSessionIds.has(sessionId)) {
      // PTY 尚未就绪：缓冲输入并触发激活。xterm 焦点上报的 \x1b[I/\x1b[O 不算用户输入。
      // eslint-disable-next-line no-control-regex
      const userInput = data.replace(/\x1b\[[IO]/g, '');
      if (userInput) {
        const buffered = this.pendingInput.get(activeTab.id) ?? '';
        this.pendingInput.set(activeTab.id, buffered + userInput);
      }
      void this.activateTab(activeTab.id);
      return;
    }
    window.digitalLife.pty.input(sessionId, data);
  };

  handleXtermResize = (
    activeTab: ActiveTerminalTab | undefined,
    cols: number,
    rows: number,
  ): void => {
    const targetSession = activeTab?.sessionId;
    if (!targetSession || !this.liveSessionIds.has(targetSession)) {
      return;
    }
    this.applySessionSize(targetSession, cols, rows);
  };

  handleKill = (activeTab: ActiveTerminalTab | undefined): void => {
    const sessionId = activeTab?.sessionId;
    if (sessionId) {
      window.digitalLife.pty.kill(sessionId);
      this.liveSessionIds.delete(sessionId);
      // 按标签更新：中心标签不是面板的 terminalActiveTabId，必须用 per-tab setter。
      useAppStore.getState().terminalUpdateTab(activeTab.id, { status: 'terminated' });
    }
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
    const createdTabId = useAppStore.getState().terminalActiveTabId;
    await this.attachSession(createdTabId, finalProfile, workspaceId ?? '');
  };

  handleSelectTab = (tabId: string): void => {
    const currentActiveTabId = useAppStore.getState().terminalActiveTabId;
    if (tabId === currentActiveTabId) {
      return;
    }
    useAppStore.getState().terminalSelectTab(tabId);
    void this.activateTab(tabId);
  };

  handleCloseTab = (tabId: string): void => {
    const tabs = useAppStore.getState().terminalTabs;
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      // kill 失败仅日志：标签关闭流程（store / xterm 池）不受影响。
      void window.digitalLife.pty
        .kill(tab.sessionId)
        .catch((e) => console.warn('[pty] kill on tab close failed:', e));
      terminalXtermPool.release(tab.sessionId);
      this.liveSessionIds.delete(tab.sessionId);
      this.ptyDims.delete(tab.sessionId);
      this.createdSessionIds.delete(tab.sessionId);
      this.oscCarry.delete(tab.sessionId);
    }
    this.pendingInput.delete(tabId);
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
      this.pendingInput.delete(tab.id);
      if (tab.sessionId) {
        void window.digitalLife.pty
          .kill(tab.sessionId)
          .catch((e) => console.warn('[pty] kill on close-all failed:', e));
        terminalXtermPool.release(tab.sessionId);
        this.liveSessionIds.delete(tab.sessionId);
        this.ptyDims.delete(tab.sessionId);
        this.createdSessionIds.delete(tab.sessionId);
        this.oscCarry.delete(tab.sessionId);
      }
    });
    this.persistTabCwds();
    useAppStore.getState().terminalCloseAllTabs(workspaceId);
  };
}

/** 应用级单例：所有终端 PTY 运行时状态与全局副作用的唯一归属。 */
export const terminalPtyRuntime = new TerminalPtyRuntime();
