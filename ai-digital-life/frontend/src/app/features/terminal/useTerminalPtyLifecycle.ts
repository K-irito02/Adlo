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

const MAX_SESSION_OUTPUT_BYTES = 100 * 1024;

const SHELL_MAP: Record<TerminalProfile, string> = {
  powershell: 'powershell',
  bash: 'bash',
  cmd: 'cmd',
};

/** 判断某会话是否为当前活动标签的会话（回放校验用） */
function isActiveSession(sessionId: string): boolean {
  const state = useAppStore.getState();
  const activeTab = state.terminalTabs.find((t) => t.id === state.terminalActiveTabId);
  return activeTab?.sessionId === sessionId;
}

/** 等待浏览器下一帧（用于等待 xterm 实例挂载就绪，替代固定延时） */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * 「恢复会话」头部需要被剥离的 CSI 终止字节 —— 都属于「屏幕重置」类：
 * J=ED(清屏) K=EL(清行) H/f=CUP(光标归位) G=CHA d=VPA A~F=相对光标移动。
 *
 * 新版 shell 启动时会先输出这些序列（cmd 实测为 `ESC[?25l ESC[2J ESC[m ESC[H`）。
 * 若原样透传，它会把刚刚回放出来的持久化历史整屏擦掉、并把光标挪回顶部，
 * 这正是重启后历史「整体瞬间跳动上移/消失」的直接原因。
 */
const REVIVE_HEAD_DROP_FINALS = new Set([
  'J',
  'K',
  'H',
  'f',
  'G',
  'd',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
]);

function isCsiParamOrIntermediate(ch: string): boolean {
  const code = ch.charCodeAt(0);
  // CSI 参数字节 0x30-0x3F、中间字节 0x20-0x2F
  return (code >= 0x30 && code <= 0x3f) || (code >= 0x20 && code <= 0x2f);
}

/**
 * 剥离「恢复会话」头部输出中的屏幕重置序列与伴随的整屏空行。
 * - 仅在会话头部生效：进入正文（出现可打印字符）后调用方就不再调用本函数，
 *   因此用户主动执行 `cls` / `clear` 等清屏命令完全不受影响。
 * - 无害的控制序列（如 `ESC[m`、`ESC[?25l` 光标显隐）原样保留。
 * - OSC（如窗口标题 `ESC]0;...BEL`）整体跳过：标题文字不是屏幕正文，
 *   不能据此判定「已进入正文」，否则其后的空行填充会漏过净化。
 * - 正文出现之前的 `\r` / `\n` 一律吞掉：ConPTY 在 PTY resize 后会重发
 *   整屏（`ESC[2J ESC[H` + 每行一个 `\r\n` 的填充），若原样落屏会把
 *   新提示符顶到画面底部、并在历史与新提示符之间留出一大片空白。
 */
function sanitizeReviveHead(data: string): { data: string; printable: boolean } {
  let out = '';
  let i = 0;
  let printable = false;
  while (i < data.length) {
    if (data[i] === '\u001b' && data[i + 1] === '[') {
      let j = i + 2;
      while (j < data.length && isCsiParamOrIntermediate(data[j])) {
        j += 1;
      }
      if (j >= data.length) {
        // CSI 跨块截断：整段原样保留，等下一块拼接后再判断
        out += data.slice(i);
        break;
      }
      if (!REVIVE_HEAD_DROP_FINALS.has(data[j])) {
        out += data.slice(i, j + 1);
      }
      i = j + 1;
      continue;
    }
    if (data[i] === '\u001b' && data[i + 1] === ']') {
      // OSC 序列：找到终止符（BEL 或 ESC\）后整体丢弃，不标记 printable。
      // 跨块截断时丢弃已收到的部分（标题文字本就不该落屏），
      // 下一块里的终止符（单个 BEL）是无害控制字符，会原样透传。
      let j = i + 2;
      while (j < data.length) {
        if (data[j] === '\u0007') {
          j += 1;
          break;
        }
        if (data[j] === '\u001b' && data[j + 1] === '\\') {
          j += 2;
          break;
        }
        j += 1;
      }
      i = j;
      continue;
    }
    const ch = data[i];
    if (ch === '\r' || ch === '\n') {
      if (!printable) {
        // 头部阶段的换行：属于整屏重发填充，吞掉
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) {
      printable = true;
    }
    out += ch;
    i += 1;
  }
  return { data: out, printable };
}

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
  // 本次运行中新建的会话（用于区分「重启恢复的标签」与「新建标签」）
  const createdSessionIdsRef = useRef<Set<string>>(new Set());
  // 当前仍然存活的 PTY 会话（应用重启后恢复的标签不在其中 → 需要重建）
  const liveSessionIdsRef = useRef<Set<string>>(new Set());
  // 正在重建会话的标签（防止并发重复重建）
  const revivingTabIdsRef = useRef<Set<string>>(new Set());
  // 重建期间缓冲的用户输入（重建完成后补发，避免丢字）
  const pendingInputRef = useRef('');
  // 恢复会话（重建 + 历史迁移）的头部输出需要剥离屏幕重置序列
  const reviveHeadSessionIdsRef = useRef<Set<string>>(new Set());
  // 恢复会话的头部是否还需要补一个换行（避免 banner 紧贴旧历史最后一行）
  const reviveHeadNeedsBreakRef = useRef<Set<string>>(new Set());
  // 恢复期间是否已把 xterm 画面隐藏
  const hiddenForRestoreRef = useRef(false);
  const restoreUnhideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 上一次上报给 xterm 的尺寸签名（用于判断是否发生了会触发重排的 resize）
  const lastDimsRef = useRef('');
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
    console.log(`[ADL-DEBUG] terminal cwd store hydrated — tabs=${Object.keys(stored).length}`);
  }, []);

  /** 持久化整个「标签 → 目录」映射（写入在 store 内去抖） */
  const persistTabCwds = useCallback(() => {
    const snapshot: Record<string, string> = {};
    tabCwdRef.current.forEach((cwd, tabId) => {
      snapshot[tabId] = cwd;
    });
    terminalCwdStore.saveAll(snapshot);
  }, []);

  /** 恢复历史期间隐藏终端画面，让用户只看到「一次性绘制完成」的最终态。 */
  const hideWhileRestoring = useCallback((tabId: string) => {
    if (restoreUnhideTimerRef.current) {
      clearTimeout(restoreUnhideTimerRef.current);
      restoreUnhideTimerRef.current = null;
    }
    if (!hiddenForRestoreRef.current) {
      hiddenForRestoreRef.current = true;
      console.log(`[ADL-DEBUG] hide for restore — tab=${tabId}`);
    }
    // 兜底：即使新 shell 一个字节都不输出，也不能让画面一直黑着
    restoreUnhideTimerRef.current = setTimeout(() => {
      restoreUnhideTimerRef.current = null;
      if (hiddenForRestoreRef.current) {
        hiddenForRestoreRef.current = false;
        console.log(`[ADL-DEBUG] unhide (timeout) — tab=${tabId}`);
      }
    }, 900);
  }, []);

  /** 恢复流程结束（新 shell 头部已落屏），恢复画面显示。 */
  const revealAfterRestoring = useCallback((reason: string) => {
    if (restoreUnhideTimerRef.current) {
      clearTimeout(restoreUnhideTimerRef.current);
      restoreUnhideTimerRef.current = null;
    }
    if (hiddenForRestoreRef.current) {
      hiddenForRestoreRef.current = false;
      console.log(`[ADL-DEBUG] unhide — reason=${reason}`);
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
    const startedAt = performance.now();
    const promise = terminalOutputStore
      .load(sessionId)
      .then((output) => {
        // 仅在该会话尚无内存缓冲时写入，避免覆盖已累积的实时输出
        if (output && !sessionOutputsRef.current.has(sessionId)) {
          // 存量清洗：旧版本缓冲里可能混有 ConPTY 重绘爆发，加载时统一剥离
          const cleaned = stripConptyRepaintBursts(output);
          if (cleaned.bursts > 0) {
            console.log(
              `[ADL-DEBUG] repaint bursts cleaned on load — session=${sessionId} bursts=${cleaned.bursts} bytesRemoved=${cleaned.bytesRemoved}`,
            );
          }
          sessionOutputsRef.current.set(sessionId, cleaned.text);
        }
        return output;
      })
      .catch((err) => {
        console.warn(`[ADL-DEBUG] terminal output load failed — session=${sessionId}`, err);
        return null;
      })
      .then((output) => {
        loadPromisesRef.current.delete(sessionId);
        loadedSessionIdsRef.current.add(sessionId);
        console.log(
          `[ADL-DEBUG] terminal output loaded — session=${sessionId} bytes=${output?.length ?? 0} elapsedMs=${Math.round(performance.now() - startedAt)}`,
        );
        return sessionOutputsRef.current.get(sessionId) ?? output;
      });
    loadPromisesRef.current.set(sessionId, promise);
    return promise;
  }, []);

  /** 等待 xterm 实例挂载就绪（最多 ~30 帧），避免固定延时 */
  const waitForTerminal = useCallback(async (maxFrames = 30): Promise<boolean> => {
    for (let frame = 0; frame < maxFrames; frame += 1) {
      if (xtermRef.current) {
        return true;
      }
      await nextFrame();
    }
    return xtermRef.current != null;
  }, []);

  // 回放期间的守卫：回放窗口内的 live 输出不再单独写入 xterm，
  // 避免与回放的完整缓冲重复显示。
  const restoringSessionRef = useRef<string | null>(null);

  /**
   * 回放某会话的输出到 xterm：
   * - 若该会话仍在加载中，则 await 加载完成后再回放（不再出现"点了没反应"）
   * - 等待 xterm 就绪后再写入（替代固定 50ms 延时）
   */
  const replaySession = useCallback(
    async (sessionId: string, options?: { focus?: boolean }): Promise<void> => {
      const startedAt = performance.now();
      const awaitedLoad = !loadedSessionIdsRef.current.has(sessionId);
      restoringSessionRef.current = sessionId;
      console.log(
        `[ADL-DEBUG] replaySession START — session=${sessionId} awaitedLoad=${awaitedLoad} t=${Math.round(performance.now())}`,
      );
      try {
        const output = await ensureLoaded(sessionId);
        console.log(
          `[ADL-DEBUG] replaySession loaded — session=${sessionId} bytes=${(output ?? '').length} t=${Math.round(performance.now())}`,
        );
        await waitForTerminal();
        // 先等 xterm 完成首帧自适应（挂载时由 setTimeout 触发的 initialFit），
        // 再按最终尺寸 fit、最后写入历史：避免「先写入、后 fit」触发整屏重排，
        // 导致历史内容整体跳动/上移（重启首屏的闪烁即由此产生）。
        await nextFrame();
        const el = document.querySelector('.adl-terminal-canvas');
        const containerW = el?.clientWidth ?? 0;
        const containerH = el?.clientHeight ?? 0;
        const xtermDims = xtermRef.current?.getDims();
        console.log(
          `[ADL-DEBUG] replaySession pre-fit — container=${containerW}x${containerH} xtermDims=${xtermDims ? `${xtermDims.cols}x${xtermDims.rows}` : 'null'} t=${Math.round(performance.now())}`,
        );
        if (restoringSessionRef.current !== sessionId || !isActiveSession(sessionId)) {
          console.log(
            `[ADL-DEBUG] replay aborted — session=${sessionId} awaitedLoad=${awaitedLoad} elapsedMs=${Math.round(performance.now() - startedAt)}`,
          );
          return;
        }
        xtermRef.current?.resize();
        const postResizeDims = xtermRef.current?.getDims();
        console.log(
          `[ADL-DEBUG] replaySession post-resize — xtermDims=${postResizeDims ? `${postResizeDims.cols}x${postResizeDims.rows}` : 'null'} t=${Math.round(performance.now())}`,
        );
        xtermRef.current?.clear();
        const replayRaw = output ?? sessionOutputsRef.current.get(sessionId) ?? '';
        // 回放线性化：剥离缓冲里混入的 ConPTY 重绘爆发（尺寸变化时产生），
        // 否则回放会出现空行游程滚动画面、banner/提示符重复、CUP 跳位
        const replay = stripConptyRepaintBursts(replayRaw);
        if (replay.bursts > 0) {
          console.log(
            `[ADL-DEBUG] repaint bursts cleaned on replay — session=${sessionId} bursts=${replay.bursts} bytesRemoved=${replay.bytesRemoved}`,
          );
        }
        if (replay.text) {
          xtermRef.current?.write(replay.text);
        }
        xtermRef.current?.scrollToBottom();
        if (options?.focus !== false) {
          xtermRef.current?.focus();
        }
        console.log(
          `[ADL-DEBUG] replay done — session=${sessionId} bytes=${replay.text.length} rawBytes=${replayRaw.length} bursts=${replay.bursts} awaitedLoad=${awaitedLoad} elapsedMs=${Math.round(performance.now() - startedAt)}`,
        );
      } finally {
        // 回放结束：捕获 sessionId
        const replayedSession = restoringSessionRef.current;

        // 检测 PTY 尺寸是否过期：回放期间跳过了 PTY resize，
        // 但回放结束后容器尺寸可能已变化（窗口 resize），ResizeObserver
        // 不会再触发（容器尺寸未变），需要主动补一次 PTY resize。
        if (replayedSession && liveSessionIdsRef.current.has(replayedSession)) {
          const dims = xtermRef.current?.getDims();
          const ptyHas = ptyDimsRef.current.get(replayedSession);
          if (
            dims &&
            dims.cols > 0 &&
            dims.rows > 0 &&
            (!ptyHas || ptyHas.cols !== dims.cols || ptyHas.rows !== dims.rows)
          ) {
            console.log(
              `[ADL-DEBUG] pty resize after replay — session=${replayedSession} ptyHas=${ptyHas ? `${ptyHas.cols}x${ptyHas.rows}` : 'none'} → ${dims.cols}x${dims.rows} t=${Math.round(performance.now())}`,
            );
            ptyDimsRef.current.set(replayedSession, { cols: dims.cols, rows: dims.rows });
            window.digitalLife.pty.resize(replayedSession, dims.cols, dims.rows);
          }
        }

        // 延迟 300ms 清除 restoringSessionRef：PTY resize 会触发 ConPTY 异步
        // 重绘（整屏重发），该重绘通过 PTY 数据流到达 handleXtermData。
        // 如果此时 restoringSessionRef 已清除，重绘数据会写入 xterm 覆盖
        // 刚回放的内容。保持守卫300ms 可过滤该异步重绘。
        // 代价：此窗口内的 PTY 输出（用户输入的 shell 响应）也会被过滤，
        // 但用户刚切换完标签，300ms 内几乎不会有交互。
        if (replayedSession) {
          await new Promise<void>((resolve) => {
            setTimeout(() => {
              console.log(
                `[ADL-DEBUG] replay guard cleared — session=${replayedSession} t=${Math.round(performance.now())}`,
              );
              restoringSessionRef.current = null;
              resolve();
            }, 300);
          });
        } else {
          restoringSessionRef.current = null;
        }
      }
    },
    [ensureLoaded, waitForTerminal],
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
   * 为指定标签创建（或重建）一个 PTY 会话并挂到该标签上。
   * - `carry`：重建场景下把旧会话的历史缓冲迁移到新会话 id，
   *   保证「切走再切回」仍能回放完整历史。
   * - `revived`：本次创建属于「重启后恢复死标签」，新 shell 头部会输出
   *   屏幕重置序列，需要剥离后再写入（否则会擦掉刚回放的历史）。
   */
  const attachSession = useCallback(
    async (
      tabId: string,
      profile: TerminalProfile,
      workspaceId: string,
      options?: { carry?: string; revived?: boolean; cwdOverride?: string },
    ): Promise<void> => {
      const carry = options?.carry;
      const revived = options?.revived === true;
      const cwdOverride = options?.cwdOverride;
      const workspace = workspaceId
        ? recentWorkspaces.find((w) => w.id === workspaceId)
        : undefined;
      ensureTabCwdsLoaded();
      // 起始目录优先级：shell 上报并记住的「上次所在目录」> 工作区路径 > 用户主目录。
      // 记住的目录可能已被删除，服务端会校验并回退，因此这里可以放心传递。
      const cwd = cwdOverride ?? (workspaceId ? (workspace?.path ?? undefined) : undefined);
      console.log(
        `[ADL-DEBUG] attach session — tab=${tabId} profile=${profile} workspaceId=${workspaceId || '(independent)'} cwd=${cwd ?? '(user home)'} cwdSource=${cwdOverride ? 'remembered' : workspaceId ? 'workspace' : 'home'} carryBytes=${carry?.length ?? 0} revived=${revived}`,
      );

      try {
        // 以 xterm 的真实尺寸创建 PTY。此前固定 80x24 创建、随后被 resize 到
        // 142x46，ConPTY 对「行数变化」的响应是整屏重发（ESC[2J ESC[H + 每行
        // 一个 \r\n 的填充）——这正是重启恢复后新提示符被顶到画面底部、
        // 历史与新提示符之间出现大片空白的直接根源。
        // xterm 未就绪（面板不可见等）时回退 80x24，由既有的 resize 路径兜底。
        const terminalReady = await waitForTerminal(10);
        await nextFrame();
        const realDims = terminalReady ? xtermRef.current?.getDims() : undefined;
        const cols = realDims && realDims.cols > 0 ? realDims.cols : 80;
        const rows = realDims && realDims.rows > 0 ? realDims.rows : 24;
        console.log(
          `[ADL-DEBUG] attachSession creating PTY — tab=${tabId} cols=${cols} rows=${rows} realDims=${realDims ? `${realDims.cols}x${realDims.rows}` : 'null'} terminalReady=${terminalReady} t=${Math.round(performance.now())}`,
        );
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
          revealAfterRestoring('attach-failed');
          void waitForTerminal().then(() => {
            xtermRef.current?.write(
              `\r\n\x1b[31mError: Failed to start ${profile} terminal.\x1b[0m\r\n`,
            );
            xtermRef.current?.write(`\x1b[31m${errorMsg}\x1b[0m\r\n\r\n`);
            if (profile === 'bash') {
              xtermRef.current?.write(
                '\x1b[33mHint: Make sure Git for Windows or WSL is installed.\x1b[0m\r\n',
              );
            }
          });
          return;
        }

        const sessionId = result.data.sessionId;
        createdSessionIdsRef.current.add(sessionId);
        liveSessionIdsRef.current.add(sessionId);
        // 记录 PTY 实际生效尺寸：后续同尺寸的 resize 上报将被跳过（见 handleXtermResize）
        ptyDimsRef.current.set(sessionId, { cols, rows });
        if (revived) {
          // 【易漏点】必须在这里登记，否则 `sanitizeReviveHead` / 补换行逻辑
          // 永远不会被触发（此前正是遗漏了 add，导致新 shell 的 ESC[2J 原样落屏）。
          // 必须在拿到 sessionId 后、任何输出到达前登记。
          reviveHeadSessionIdsRef.current.add(sessionId);
          reviveHeadNeedsBreakRef.current.add(sessionId);
          console.log(`[ADL-DEBUG] revive head armed — session=${sessionId} tab=${tabId}`);
        }
        if (carry !== undefined && carry.length > 0) {
          // 历史迁移：内存缓冲 + 立即持久化到新 sessionId。
          // 必须等落盘成功后才允许删除旧记录（调用方据此判断），否则一次瞬时的
          // 加载/写入失败就会把唯一的历史副本删掉。
          sessionOutputsRef.current.set(sessionId, carry);
          loadedSessionIdsRef.current.add(sessionId);
          const saved = await terminalOutputStore.save(sessionId, carry);
          console.log(
            `[ADL-DEBUG] history migrated — tab=${tabId} newSession=${sessionId} bytes=${carry.length} saved=${saved}`,
          );
        }
        terminalUpdateTab(tabId, { sessionId, status: 'running' });

        void waitForTerminal().then(() => {
          if (!isActiveSession(sessionId)) {
            return;
          }
          // 只同步 PTY 尺寸、不做 fit：fit 一旦改变列数会按新宽度重排整个缓冲，
          // 若发生在历史回放之后，用户看到的就是「历史瞬间跳动上移」。
          xtermRef.current?.reportSize();
          xtermRef.current?.focus();
        });
      } catch (err) {
        console.error('Terminal creation error:', err);
        terminalUpdateTab(tabId, { status: 'terminated' });
        revealAfterRestoring('attach-error');
        void waitForTerminal().then(() => {
          xtermRef.current?.write(
            `\r\n\x1b[31mError: Failed to start ${profile} terminal.\x1b[0m\r\n`,
          );
          xtermRef.current?.write(
            `\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n\r\n`,
          );
        });
      }
    },
    [
      ensureTabCwdsLoaded,
      recentWorkspaces,
      revealAfterRestoring,
      terminalUpdateTab,
      waitForTerminal,
    ],
  );

  /**
   * 激活某个标签：显示其历史；若该标签持有的 PTY 会话已不存在
   * （典型场景：应用重启后恢复的标签），则为它重建会话并迁移历史。
   */
  const activateTab = useCallback(
    async (tabId: string): Promise<void> => {
      const tab = useAppStore.getState().terminalTabs.find((t) => t.id === tabId);
      const sessionId = tab?.sessionId;
      if (!tab || !sessionId) {
        console.log(
          `[ADL-DEBUG] activateTab — tab=${tabId} NOT FOUND (tab=${!!tab} sessionId=${!!sessionId}) t=${Math.round(performance.now())}`,
        );
        return;
      }
      const isLive = liveSessionIdsRef.current.has(sessionId);
      console.log(
        `[ADL-DEBUG] activateTab — tab=${tabId} session=${sessionId} isLive=${isLive} t=${Math.round(performance.now())}`,
      );
      if (isLive) {
        await replaySession(sessionId);
        return;
      }
      if (revivingTabIdsRef.current.has(tabId)) {
        console.log(
          `[ADL-DEBUG] activateTab — tab=${tabId} ALREADY REVIVING, skip t=${Math.round(performance.now())}`,
        );
        return;
      }
      console.log(
        `[ADL-DEBUG] activateTab REVIVE path — tab=${tabId} session=${sessionId} t=${Math.round(performance.now())}`,
      );
      revivingTabIdsRef.current.add(tabId);
      try {
        // 0) 整个「回放历史 + 重建会话 + 落屏」期间隐藏画面，
        //    让用户只看到一次性绘制好的最终态，而不是中间态（避免闪烁/跳动感）
        hideWhileRestoring(tabId);
        // 1) 先回放持久化历史（旧会话已不存在，只显示快照）
        await replaySession(sessionId);
        if (!isActiveSession(sessionId)) {
          revealAfterRestoring('switched-away');
          return; // 期间用户已切到别的标签
        }
        // 2) 重建会话，并把历史迁移到新 sessionId；
        //    起始目录优先用 shell 上次上报的「当前目录」（OSC 9;9）
        //    迁移前先剥离缓冲里的 ConPTY 重绘爆发，避免脏数据跟随新会话
        const carryRaw = sessionOutputsRef.current.get(sessionId) ?? '';
        const carry = stripConptyRepaintBursts(carryRaw);
        if (carry.bursts > 0) {
          console.log(
            `[ADL-DEBUG] repaint bursts cleaned on carry — tab=${tabId} oldSession=${sessionId} bursts=${carry.bursts} bytesRemoved=${carry.bytesRemoved}`,
          );
        }
        ensureTabCwdsLoaded();
        const rememberedCwd = tabCwdRef.current.get(tabId);
        console.log(
          `[ADL-DEBUG] revive dead tab — tab=${tabId} oldSession=${sessionId} carryBytes=${carry.text.length} rawBytes=${carryRaw.length} rememberedCwd=${rememberedCwd ?? '(none)'}`,
        );
        await attachSession(tabId, tab.profile, tab.workspaceId, {
          carry: carry.text,
          revived: true,
          cwdOverride: rememberedCwd,
        });
        // 3) 仅当历史确实迁移成功（非空）时才清理旧记录；
        // 历史为空（加载失败或本无内容）时保留旧记录，避免误删唯一的历史副本
        if (carry.text.length > 0) {
          sessionOutputsRef.current.delete(sessionId);
          loadedSessionIdsRef.current.delete(sessionId);
          void terminalOutputStore.delete(sessionId);
        } else {
          console.warn(
            `[ADL-DEBUG] revive without history — keep old record tab=${tabId} oldSession=${sessionId}`,
          );
        }
        // 4) 补发重建期间缓冲的输入（仅当该标签仍处于活动态，避免旧按键在后台被误执行）
        const pending = pendingInputRef.current;
        pendingInputRef.current = '';
        const newSessionId = useAppStore
          .getState()
          .terminalTabs.find((t) => t.id === tabId)?.sessionId;
        if (pending && newSessionId && isActiveSession(newSessionId)) {
          window.digitalLife.pty.input(newSessionId, pending);
        }
      } finally {
        revivingTabIdsRef.current.delete(tabId);
      }
    },
    [attachSession, ensureTabCwdsLoaded, hideWhileRestoring, replaySession, revealAfterRestoring],
  );

  // 全量预热：标签集合（含会话）就绪后，后台并行加载所有会话的持久化输出。
  // 依赖 sessionIdsKey，因此即使 store 水合晚于本组件挂载（初始 terminalTabs 为空），
  // 也会在标签出现后补加载。
  useEffect(() => {
    const sessionIds = sessionIdsKey ? sessionIdsKey.split('|') : [];
    if (sessionIds.length === 0) {
      return;
    }
    console.log(`[ADL-DEBUG] terminal output warm-up — sessions=${sessionIds.length}`);
    for (const sessionId of sessionIds) {
      void ensureLoaded(sessionId);
    }
  }, [sessionIdsKey, ensureLoaded]);

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
    console.log(`[ADL-DEBUG] startup activate restored tab — tab=${tabId} session=${sessionId}`);
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
        if (data.includes('\u001b')) {
          // 终端自身对查询序列的应答（DA/DSR 等，例如回放历史里含查询时 xterm 生成的应答）。
          // 这类数据不能缓冲后转发给新会话——会以"用户输入"形式把控制序列注入 shell。
          return;
        }
        // 会话不存在（重启后恢复的标签）：缓冲真实按键并触发重建，避免丢字
        console.log(
          `[ADL-DEBUG] input on dead session buffered — tab=${tab.id} session=${sessionId}`,
        );
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
      // 尺寸变化会让 xterm 按新宽度重排整个缓冲，这是「历史整体跳动」的
      // 另一条可能路径；因此把每一处尺寸上报都记录下来（含未变化的情形），
      // 便于下一轮日志直接判定是否发生了「绘制之后的重排」。
      const sig = `${cols}x${rows}`;
      const previousDims = lastDimsRef.current;
      lastDimsRef.current = sig;

      // 回放期间 restoringSessionRef 指向正在回放的 session（可能是非活动标签），
      // 此时 activeTab 仍指向前一个标签。必须用 restoringSessionRef 路由到
      // 正确的 PTY，否则去重检查会命中前一个 session 的尺寸而跳过 resize，
      // 导致被切换到的标签 PTY 仍以旧尺寸运行 → 内容错位。
      const targetSession = restoringSessionRef.current ?? activeTab?.sessionId;
      console.log(
        `[ADL-DEBUG] xterm dims reported — ${previousDims || '(init)'} → ${sig} changed=${previousDims !== '' && previousDims !== sig} restoring=${restoringSessionRef.current ?? 'none'} target=${targetSession ?? 'none'} t=${Math.round(performance.now())}`,
      );
      if (targetSession && liveSessionIdsRef.current.has(targetSession)) {
        const effective = ptyDimsRef.current.get(targetSession);
        if (effective && effective.cols === cols && effective.rows === rows) {
          // 同尺寸重复上报（挂载 initialFit / 回放前 fit / 切回标签都会触发）：
          // 直接跳过。ConPTY 哪怕收到同尺寸 resize 也会重发整屏片段，
          // 既污染输出缓冲（每次约 +256 字节），回放时还会扰动画面。
          console.log(
            `[ADL-DEBUG] pty resize skipped (unchanged) — session=${targetSession} dims=${cols}x${rows}`,
          );
          return;
        }
        // 回放期间跳过 PTY resize：回放内容是在旧尺寸下生成的，
        // resize 会触发 ConPTY 重绘整个屏幕（用当前 shell 状态），
        // 覆盖刚回放的历史内容 → 内容被裁剪/消失。
        // resize 延迟到回放结束后由 ResizeObserver 自然触发。
        if (restoringSessionRef.current !== null) {
          console.log(
            `[ADL-DEBUG] pty resize skipped (replaying) — session=${targetSession} dims=${cols}x${rows} ptyHas=${effective ? `${effective.cols}x${effective.rows}` : 'none'}`,
          );
          return;
        }
        ptyDimsRef.current.set(targetSession, { cols, rows });
        window.digitalLife.pty.resize(targetSession, cols, rows);
      }
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

      xtermRef.current?.clear();
      revealAfterRestoring('create-tab');
      terminalCreateTab(finalProfile, workspaceId ?? '');
      // 捕获新标签 id：create await 期间用户可能切换标签，
      // 用固定 id 而非"当前活动标签"挂载 sessionId，避免挂错标签
      const createdTabId = useAppStore.getState().terminalActiveTabId;
      await attachSession(createdTabId, finalProfile, workspaceId ?? '');
    },
    [attachSession, revealAfterRestoring, terminalCreateTab],
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
        liveSessionIdsRef.current.delete(tab.sessionId);
        createdSessionIdsRef.current.delete(tab.sessionId);
        reviveHeadSessionIdsRef.current.delete(tab.sessionId);
        reviveHeadNeedsBreakRef.current.delete(tab.sessionId);
        oscCarryRef.current.delete(tab.sessionId);
        sessionOutputsRef.current.delete(tab.sessionId);
        loadedSessionIdsRef.current.delete(tab.sessionId);
        loadPromisesRef.current.delete(tab.sessionId);
        terminalOutputStore.delete(tab.sessionId);
      }
      revivingTabIdsRef.current.delete(tabId);
      revealAfterRestoring('tab-closed');
      // 标签关闭即清理该标签记住的「上次所在目录」
      if (tabCwdRef.current.delete(tabId)) {
        persistTabCwds();
      }
      terminalCloseTab(tabId);
    },
    [persistTabCwds, revealAfterRestoring, terminalCloseTab],
  );

  const handleCloseAllTabs = useCallback(
    (workspaceId?: string) => {
      const tabs = useAppStore.getState().terminalTabs;
      const tabsToClose =
        workspaceId !== undefined ? tabs.filter((tab) => tab.workspaceId === workspaceId) : tabs;
      tabsToClose.forEach((tab) => {
        revivingTabIdsRef.current.delete(tab.id);
        if (tab.sessionId) {
          window.digitalLife.pty.kill(tab.sessionId);
          liveSessionIdsRef.current.delete(tab.sessionId);
          ptyDimsRef.current.delete(tab.sessionId);
          createdSessionIdsRef.current.delete(tab.sessionId);
          reviveHeadSessionIdsRef.current.delete(tab.sessionId);
          reviveHeadNeedsBreakRef.current.delete(tab.sessionId);
          sessionOutputsRef.current.delete(tab.sessionId);
          loadedSessionIdsRef.current.delete(tab.sessionId);
          loadPromisesRef.current.delete(tab.sessionId);
          terminalOutputStore.delete(tab.sessionId);
        }
      });
      terminalCloseAllTabs(workspaceId);
      revealAfterRestoring('all-tabs-closed');
    },
    [revealAfterRestoring, terminalCloseAllTabs],
  );

  const handleKill = useCallback(() => {
    const sessionId = activeTab?.sessionId;
    if (sessionId) {
      window.digitalLife.pty.kill(sessionId);
      liveSessionIdsRef.current.delete(sessionId);
      terminalUpdateActiveTab({ status: 'terminated' });
      revealAfterRestoring('killed');
    }
  }, [activeTab?.sessionId, revealAfterRestoring, terminalUpdateActiveTab]);

  useEffect(() => {
    if (activeRightTool !== 'terminal') {
      return;
    }

    const unsub = window.digitalLife.subscribePtyOutput((event) => {
      if (event.terminated) {
        // 会话已退出：标记为不存活，并仅将对应标签置为 terminated，保留输出供用户回看
        liveSessionIdsRef.current.delete(event.sessionId);
        ptyDimsRef.current.delete(event.sessionId);
        reviveHeadSessionIdsRef.current.delete(event.sessionId);
        reviveHeadNeedsBreakRef.current.delete(event.sessionId);
        // 若正处在恢复隐藏窗口内，立即恢复显示，避免画面一直黑着
        revealAfterRestoring('session-terminated');
        const tabs = useAppStore.getState().terminalTabs;
        const tab = tabs.find((t) => t.sessionId === event.sessionId);
        if (tab) {
          terminalUpdateTab(tab.id, { status: 'terminated' });
        }
        // 不删除输出 — 用户仍可滚动查看历史，关闭标签时再清理
        return;
      }

      let data = event.data;

      // 恢复会话的「头部净化」：新 shell 启动时会先输出屏幕重置序列
      // （cmd 实测为 ESC[?25l ESC[2J ESC[m ESC[H）。若原样落屏，会把刚回放的
      // 持久化历史整屏擦掉、光标归位到顶部 → 表现为「历史整体瞬间跳动上移」。
      // 只处理头部：一旦出现可打印字符（进入正文）就不再干预，
      // 因此用户主动执行 cls / clear 完全不受影响。
      if (reviveHeadSessionIdsRef.current.has(event.sessionId)) {
        const { data: cleaned, printable } = sanitizeReviveHead(data);
        console.log(
          `[ADL-DEBUG] revive head chunk — session=${event.sessionId} rawBytes=${data.length} sanitizedBytes=${cleaned.length} printable=${printable} t=${Math.round(performance.now())}`,
        );
        data = cleaned;
        if (printable) {
          reviveHeadSessionIdsRef.current.delete(event.sessionId);
          // 新 shell 头部已落屏：结束隐藏，让用户看到一次性绘制完成的最终态
          revealAfterRestoring('revive-head-flushed');
        }
        if (data.length === 0) {
          return; // 整块都是屏幕重置序列：丢弃
        }
        if (reviveHeadNeedsBreakRef.current.has(event.sessionId)) {
          // 被剥离的清屏序列原本会把光标挪到新行；剥离后需要自己补一个换行，
          // 否则新 shell 的 banner/提示符会紧贴在旧历史最后一行后面。
          reviveHeadNeedsBreakRef.current.delete(event.sessionId);
          data = `\r\n${data}`;
        }
      }

      // 按标签记住 shell 上报的当前目录（OSC 9;9）。
      // 目的：重启后重建会话时把起始目录设回「上次所在目录」——新 shell 是全新进程，
      // 无法继承旧进程的目录状态，只能由 shell 自己上报（VS Code / Windows Terminal 同方案）。
      // 注意用原始 event.data 解析（与头部净化互不干扰）。
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
            console.log(
              `[ADL-DEBUG] cwd reported — tab=${ownerTab.id} profile=${ownerTab.profile} cwd=${normalized}`,
            );
          }
        }
      }

      const outputs = sessionOutputsRef.current;
      let previous = outputs.get(event.sessionId) ?? '';
      previous += data;
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
            // 持久化前剥离重绘爆发，并把清洗结果写回内存缓冲，
            // 保证「内存 == 落盘」一致，下次会话加载的就是干净历史
            const cleaned = stripConptyRepaintBursts(latest);
            if (cleaned.bursts > 0) {
              console.log(
                `[ADL-DEBUG] repaint bursts cleaned on save — session=${event.sessionId} bursts=${cleaned.bursts} bytesRemoved=${cleaned.bytesRemoved}`,
              );
              sessionOutputsRef.current.set(event.sessionId, cleaned.text);
            }
            terminalOutputStore.save(event.sessionId, cleaned.text);
          }
        }, 500),
      );

      if (
        event.sessionId === activeTab?.sessionId &&
        restoringSessionRef.current !== event.sessionId
      ) {
        xtermRef.current?.write(data);
      }
    });
    return () => unsub();
  }, [
    activeTab?.sessionId,
    activeRightTool,
    persistTabCwds,
    revealAfterRestoring,
    terminalUpdateTab,
  ]);

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
