import type {
  MediaSessionBridge,
  MediaSessionCommand,
  MediaSessionNowPlaying,
} from '@shared/ipc/mediaSession';

/**
 * 系统媒体卡片的**唯一归属与轮播仲裁**（事项 17 路线 A）。
 *
 * 桌面端只有一条 Rust SMTC 会话，而可能的媒体源有多个：
 * - `preview`：本地媒体预览（音频/视频元素）；
 * - `tab:<tabId>`：内置浏览器标签页里站点的媒体（镜像站点自己的
 *   `navigator.mediaSession` 元数据 + 页面媒体元素状态）。
 *
 * 口径（用户确认 2026-11-21）：
 * - **没有优先级**：本地文件与各标签页同级；
 * - 只有一个播放源时直接显示它；
 * - 多个播放源时**轮播**（每 `ROTATE_INTERVAL_MS` 切下一个，按注册顺序，切到末尾回绕）；
 * - 没有任何播放源时，显示最近更新的暂停源（卡片保持「已暂停」）；全部过期/结束时关闭卡片；
 * - 卡片按钮永远作用于**当前显示**的那个源。
 *
 * 模块级状态（非 React）：两个来源挂在不同 hook/组件上，用单例仲裁比层层 prop
 * 传递更直接；`resetSystemMediaSession()` 供测试清理。
 */
export type MediaSessionOwner = 'preview' | 'browser';

type CommandHandler = (command: MediaSessionCommand) => void;

interface SourceEntry {
  claim: MediaSessionNowPlaying;
  /** 最近一次上报时间（毫秒）：用于过期判定与暂停源的新旧排序。 */
  at: number;
}

/** 多源轮播间隔：用户要求 3 秒一个源（此前每个快照都会抢卡片，约 1s 一跳；10s 又被认为太长）。 */
const ROTATE_INTERVAL_MS = 3_000;
/** 轮播/过期检查的心跳。 */
const TICK_MS = 1_000;
/** 播放中的标签页快照必须持续刷新（页面 `timeupdate` 约 1 次/秒）。 */
const TAB_PLAYING_STALE_MS = 5_000;
/** 暂停的标签页快照保留上限：页面停住后不再有心跳，避免卡片永久残留。 */
const TAB_PAUSED_MAX_AGE_MS = 5 * 60_000;

const sources = new Map<string, SourceEntry>();
const commandHandlers = new Map<MediaSessionOwner, CommandHandler>();

let displayedId: string | null = null;
/** 当前源开始显示的毫秒时间戳（轮播计时起点）。 */
let displayedSince = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeCommands: (() => void) | null = null;
/** 上一次真正下发到 Rust 的快照签名（标题 + 状态 + 整秒进度）。 */
let lastSignature = '';

function desktopBridge(): MediaSessionBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const bridge = window.digitalLife?.mediaSession;
  return bridge?.supported ? bridge : undefined;
}

function isTabSource(id: string): boolean {
  return id.startsWith('tab:');
}

function ownerOf(id: string): MediaSessionOwner {
  return id === 'preview' ? 'preview' : 'browser';
}

function signature(claim: MediaSessionNowPlaying): string {
  const position = claim.positionMs == null ? '' : Math.floor(claim.positionMs / 1000);
  const duration = claim.durationMs == null ? '' : Math.floor(claim.durationMs / 1000);
  return [claim.title, claim.status, position, duration].join('\u0000');
}

/** 丢掉过期的标签页源（本地预览不设过期：用户可以停很久）。 */
function prune(now: number): void {
  for (const [id, entry] of sources) {
    if (!isTabSource(id)) {
      continue;
    }
    const limit = entry.claim.status === 'playing' ? TAB_PLAYING_STALE_MS : TAB_PAUSED_MAX_AGE_MS;
    if (now - entry.at > limit) {
      sources.delete(id);
    }
  }
}

function newestPausedId(): string | null {
  let best: string | null = null;
  let bestAt = -1;
  for (const [id, entry] of sources) {
    if (entry.claim.status !== 'paused') {
      continue;
    }
    if (entry.at >= bestAt) {
      best = id;
      bestAt = entry.at;
    }
  }
  return best;
}

function selectTarget(advance: boolean): string | null {
  const playing = [...sources.entries()]
    .filter(([, entry]) => entry.claim.status === 'playing')
    .map(([id]) => id);
  if (playing.length === 0) {
    return newestPausedId();
  }
  if (playing.length === 1) {
    return playing[0] ?? null;
  }
  const currentIndex = displayedId ? playing.indexOf(displayedId) : -1;
  if (currentIndex < 0) {
    return playing[0] ?? null;
  }
  if (!advance) {
    return playing[currentIndex] ?? null;
  }
  return playing[(currentIndex + 1) % playing.length] ?? null;
}

function display(id: string | null): void {
  displayedId = id;
  const bridge = desktopBridge();
  if (!bridge) {
    return;
  }
  const claim = id ? sources.get(id)?.claim : undefined;
  if (!claim) {
    if (lastSignature) {
      lastSignature = '';
      void bridge.clear();
    }
    return;
  }
  const next = signature(claim);
  if (next === lastSignature) {
    return;
  }
  lastSignature = next;
  void bridge.update(claim);
}

function syncTicker(): void {
  if (sources.size > 0 && !tickTimer) {
    tickTimer = setInterval(onTick, TICK_MS);
  } else if (sources.size === 0 && tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function refresh(advance: boolean): void {
  const now = Date.now();
  prune(now);
  const target = selectTarget(advance);
  if (target !== displayedId) {
    displayedSince = now;
  }
  display(target);
  syncTicker();
}

function onTick(): void {
  const now = Date.now();
  prune(now);
  const playingCount = [...sources.values()].filter(
    (entry) => entry.claim.status === 'playing',
  ).length;
  const advance = playingCount > 1 && now - displayedSince >= ROTATE_INTERVAL_MS;
  refresh(advance);
}

function ensureCommandSubscription(): void {
  const bridge = desktopBridge();
  if (!bridge || unsubscribeCommands) {
    return;
  }
  unsubscribeCommands = bridge.onCommand((command) => {
    if (!displayedId) {
      return;
    }
    commandHandlers.get(ownerOf(displayedId))?.(command);
  });
}

/**
 * 某个源声明/撤销当前快照（`null` = 该源不再占用卡片）。
 *
 * `preview` 为本地预览；浏览器标签页用 `tab:<tabId>`，每个标签页一个源。
 */
export function setMediaSessionSource(id: string, claim: MediaSessionNowPlaying | null): void {
  if (claim) {
    sources.set(id, { claim, at: Date.now() });
  } else {
    sources.delete(id);
    if (displayedId === id) {
      displayedId = null;
    }
  }
  ensureCommandSubscription();
  refresh(false);
}

/** 注册卡片按钮处理器（按来源种类：预览 / 标签页）。 */
export function onMediaSessionCommand(
  owner: MediaSessionOwner,
  handler: CommandHandler,
): () => void {
  commandHandlers.set(owner, handler);
  ensureCommandSubscription();
  return () => {
    if (commandHandlers.get(owner) === handler) {
      commandHandlers.delete(owner);
    }
  };
}

/** 当前显示的源 id（测试/排障用）。 */
export function currentMediaSessionSource(): string | null {
  return displayedId;
}

/** 测试用：清空源、处理器、轮播计时与去重状态。 */
export function resetSystemMediaSession(): void {
  sources.clear();
  commandHandlers.clear();
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  unsubscribeCommands?.();
  unsubscribeCommands = null;
  displayedId = null;
  displayedSince = 0;
  lastSignature = '';
}
