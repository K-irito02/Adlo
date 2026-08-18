import type { DigitalLifeBridge } from './shared/ipc/digital-life';
import type { PtyOutputEvent } from './shared/ipc/pty';
import type { PageMetaClient } from './app/utils/pageMetaClient';
import type { PageMetaUpdatedPayload, MetaSource } from './shared/ipc/browser';
import type { SiteMetaCacheEntry } from './app/utils/siteMetaBackends/types';
import {
  existingFaviconBaseline,
  shouldReplaceFavicon,
} from './app/features/browser/faviconQuality';
import {
  appInfo,
  currentWorkspaceMeta,
  ptyOutputListeners,
  MAX_PTY_LISTENERS,
  setMockCurrentWorkspace,
  setOnMockStateChange,
  type MockBridgeState,
} from './mock/mock-shared';

// Domain imports — all split into per-domain files
import { mockWorkspace } from './mock/mock-workspace';
import { mockRetrieval } from './mock/mock-retrieval';
import { mockConversation } from './mock/mock-conversation';
import { mockPatch } from './mock/mock-patch';
import { mockPty } from './mock/mock-terminal';
import { mockTask } from './mock/mock-task';
import { mockWindow } from './mock/mock-window';
import { mockApp } from './mock/mock-app';
import { mockAgent, mockSubagent } from './mock/mock-agent';
import { mockBrowser } from './mock/mock-browser';
import { mockGithub } from './mock/mock-ci';
import { mockMcp } from './mock/mock-mcp';
import { mockProvider } from './mock/mock-provider';
import { mockSnapshot } from './mock/mock-snapshot';
import { mockCommand } from './mock/mock-command';
import { mockRunActivity } from './mock/mock-run-activity';
import { mockWebTools } from './mock/mock-web-tools';
import { mockCommandsConfig } from './mock/mock-commands-config';
import { mockPermission } from './mock/mock-permission';
import { mockCompaction } from './mock/mock-compaction';
import { mockSessionFork } from './mock/mock-session-fork';
import { mockLsp } from './mock/mock-lsp';
import { mockReference } from './mock/mock-reference';
import { mockDurable } from './mock/mock-durable';
import { mockReserved } from './mock/mock-reserved';
import { mockCustomAgent } from './mock/mock-custom-agent';

const MOCK_BRIDGE_STORAGE_KEY = 'ai-digital-life-mock-bridge-state';
let persistenceEnabled = false;

function loadPersistedState(): void {
  if (!persistenceEnabled || typeof window === 'undefined') {
    return;
  }
  try {
    const stored = localStorage.getItem(MOCK_BRIDGE_STORAGE_KEY);
    if (stored) {
      const state: MockBridgeState = JSON.parse(stored);
      if (state.appInfo) {
        Object.assign(appInfo, state.appInfo);
      }
      if (state.currentWorkspaceMeta) {
        setMockCurrentWorkspace(state.currentWorkspaceMeta);
      }
    }
  } catch (e) {
    console.warn('[mock-bridge] Failed to load persisted state', e);
  }
}

function savePersistedState(): void {
  if (!persistenceEnabled || typeof window === 'undefined') {
    return;
  }
  try {
    const state: MockBridgeState = {
      appInfo,
      currentWorkspaceMeta,
    };
    localStorage.setItem(MOCK_BRIDGE_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save persisted mock bridge state', e);
  }
}

export function enableMockBridgePersistence(): void {
  persistenceEnabled = true;
  setOnMockStateChange(savePersistedState);
  loadPersistedState();
}

export function disableMockBridgePersistence(): void {
  persistenceEnabled = false;
  setOnMockStateChange(undefined);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(MOCK_BRIDGE_STORAGE_KEY);
  }
}

export { setMockActiveWorkspace } from './mock/mock-workspace';

const subscribePtyOutput = (listener: (event: PtyOutputEvent) => void) => {
  if (ptyOutputListeners.size >= MAX_PTY_LISTENERS) {
    console.warn('mock-bridge: PTY listener limit reached, dropping oldest listener');
    const oldest = ptyOutputListeners.values().next().value;
    if (oldest) {
      ptyOutputListeners.delete(oldest);
    }
  }
  ptyOutputListeners.add(listener);
  return () => void ptyOutputListeners.delete(listener);
};

export const mockDigitalLifeBridge: DigitalLifeBridge = {
  subscribeModelStream: () => () => undefined,
  subscribeRunActivity: () => () => undefined,
  subscribeTerminalStream: () => () => undefined,
  // Contract: the S2 PartStore raw SSE subscription. In the pure browser mock
  // (no ad-server) the PartStore has nothing to replay — demo part events are
  // synthesized by the demo simulator on the *mapped* v1 channels instead, so
  // this stays a no-op returning the sync unsubscribe. The preview-bridge
  // delegates the real stream to httpBridge; tauri-bridge does the same.
  subscribeSessionPartEvents: () => () => undefined,
  subscribePtyOutput,

  setLogMode: async (target: 'terminal' | 'debug', mode: 'overwrite' | 'append' | 'multi') => {
    localStorage.setItem(`adl_log_mode_${target}`, mode);
  },

  window: mockWindow,
  app: mockApp,
  workspace: mockWorkspace,
  retrieval: mockRetrieval,
  conversation: mockConversation,
  agent: mockAgent,
  subagent: mockSubagent,
  patch: mockPatch,
  command: mockCommand,
  pty: mockPty,
  task: mockTask,
  runActivity: mockRunActivity,
  browser: mockBrowser,
  github: mockGithub,
  mcp: mockMcp,
  provider: mockProvider,
  snapshot: mockSnapshot,
  webTools: mockWebTools,
  commandsConfig: mockCommandsConfig,
  permission: mockPermission,
  compaction: mockCompaction,
  sessionFork: mockSessionFork,
  lsp: mockLsp,
  reference: mockReference,
  durable: mockDurable,
  reserved: mockReserved,
  customAgent: mockCustomAgent,
};

export function setupMockBridge(): void {
  if (typeof window !== 'undefined' && !window.digitalLife) {
    (window as { digitalLife?: DigitalLifeBridge }).digitalLife = mockDigitalLifeBridge;
  }
}

// ────────────────────────────────────────────────────────────
//  mock pageMetaClient —— 内存版 PageMetaClient（测试/显式使用）
//  合并门控与 Rust `meta_merge.rs` / preview pageMetaService 语义一致：
//  - title：占位可被覆盖；http/iframe 覆盖任意；com 仅覆盖占位或 com/google 来源
//  - favicon：dataUri 不可覆盖、低质量不覆盖高质量（shouldReplaceFavicon）
//  - report 双未命中（title 与 favicon 均未应用）时不写入、不广播
// ────────────────────────────────────────────────────────────

/** 缓存键归一化（与 siteMetaCache.normalizeUrlForCache 一致）。 */
function normalizeCacheKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    const noHash = url.split('#')[0] || url;
    if (noHash.length > 8 && noHash.endsWith('/')) {
      return noHash.replace(/\/+$/, '');
    }
    return noHash;
  }
}

/** 占位标题：空 / 等于 URL / http(s) 前缀 / 裸域名（与 useBrowserPageMeta / meta_merge 一致）。 */
function isPlaceholderTitle(title: string, url: string): boolean {
  if (!title) {
    return true;
  }
  if (title === url) {
    return true;
  }
  if (/^https?:\/\//i.test(title)) {
    return true;
  }
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    if (!host) {
      return false;
    }
    const t = title.trim().toLowerCase();
    return t === host || t === `www.${host}`;
  } catch {
    return false;
  }
}

/** 标题合并门控（与 Rust meta_merge::should_apply_exact_match_title 一致）。 */
function shouldApplyExactMatchTitle(
  currentTitle: string,
  url: string,
  incomingTitle: string,
  source: MetaSource,
  currentSource: MetaSource | undefined,
): boolean {
  if (incomingTitle === '') {
    return false;
  }
  if (incomingTitle === currentTitle) {
    return false;
  }
  if (isPlaceholderTitle(incomingTitle, url)) {
    return false;
  }
  if (isPlaceholderTitle(currentTitle, url)) {
    return true;
  }
  if (source === 'http' || source === 'iframe') {
    return true;
  }
  if (source === 'com') {
    return currentSource === 'com' || currentSource === 'google';
  }
  return false;
}

/**
 * 创建内存版 PageMetaClient：Map + Set<listener>，实现全部接口方法。
 * 仅供测试/显式使用；不影响 pageMetaClient 的生产选择逻辑（isTauriShell 两态保持）。
 */
export function createMockPageMetaClient(): PageMetaClient {
  const memory = new Map<string, SiteMetaCacheEntry>();
  const listeners = new Set<(p: PageMetaUpdatedPayload) => void>();

  function broadcast(payload: PageMetaUpdatedPayload): void {
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // 单监听器异常不影响其他监听器
      }
    }
  }

  return {
    peek: (url) => memory.get(normalizeCacheKey(url)),
    get: async (url) => {
      const entry = memory.get(normalizeCacheKey(url));
      if (!entry) {
        return null;
      }
      return {
        title: entry.title,
        favicon: entry.faviconUrl,
        faviconDataUri: entry.faviconDataUri,
        url,
      };
    },
    getSilent: async (url) => {
      const entry = memory.get(normalizeCacheKey(url));
      if (!entry) {
        return null;
      }
      return {
        title: entry.title,
        favicon: entry.faviconUrl,
        faviconDataUri: entry.faviconDataUri,
        url,
      };
    },
    report: async (meta, source) => {
      const key = normalizeCacheKey(meta.url);
      const existing = memory.get(key);
      const curTitle = existing?.title ?? '';
      const curSource = existing?.titleSource as MetaSource | undefined;
      const titleApplied =
        meta.title !== '' &&
        shouldApplyExactMatchTitle(curTitle, key, meta.title, source, curSource);
      const existingFav = existing
        ? existingFaviconBaseline({
            faviconDataUri: existing.faviconDataUri,
            faviconUrl: existing.faviconUrl,
          })
        : undefined;
      const faviconApplied = shouldReplaceFavicon(existingFav, meta.favicon);
      if (!titleApplied && !faviconApplied) {
        return; // 双未命中：不写入、不广播
      }
      const now = Date.now();
      const entry: SiteMetaCacheEntry = {
        title: titleApplied ? meta.title : (existing?.title ?? ''),
        titleSource: titleApplied ? source : (existing?.titleSource ?? ''),
        faviconUrl: faviconApplied ? meta.favicon : (existing?.faviconUrl ?? ''),
        // report 不注入 dataUri（与 Rust/preview report 一致：dataUri 仅由抓取写入）
        faviconDataUri: existing?.faviconDataUri ?? '',
        fetchedAt: now,
        lastOkAt: now,
        nextRetryAt: 0,
        failCount: 0,
      };
      memory.set(key, entry);
      broadcast({
        url: key,
        title: entry.title,
        faviconUrl: entry.faviconUrl,
        faviconDataUri: entry.faviconDataUri,
        source,
      });
    },
    refresh: async (url) => {
      // mock 中 force 语义无差别：与 get 同返回内存缓存
      const entry = memory.get(normalizeCacheKey(url));
      if (!entry) {
        return null;
      }
      return {
        title: entry.title,
        favicon: entry.faviconUrl,
        faviconDataUri: entry.faviconDataUri,
        url,
      };
    },
    warmup: async () => {},
    subscribeUpdated: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
