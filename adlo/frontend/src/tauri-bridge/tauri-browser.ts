import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  BrowserBridge,
  BrowserMediaCommand,
  BrowserMediaStatePayload,
  BrowserNewTabRequest,
} from '../shared/ipc/browser';
import type { AgentSiteOverride, AgentSiteRule } from '../shared/ipc-types.generated';
import { invokeIpc, subscribeChannel } from './tauri-shared';

export function createTauriBrowserBridge(): BrowserBridge {
  return {
    createForTab: (
      tabId: string,
      url: string,
      colorScheme?: 'light' | 'dark',
      location?: 'panel' | 'center',
      agentOrigins?: string[],
      agentInterceptEnabled?: boolean,
      agentSiteRules?: AgentSiteRule[],
      agentSiteOverrides?: AgentSiteOverride[],
    ) =>
      invokeIpc<string | null>('browser_create_for_tab', {
        tabId,
        url,
        colorScheme,
        location,
        agentOrigins,
        agentInterceptEnabled,
        agentSiteRules,
        agentSiteOverrides,
      }).then((r) => (r.ok ? r.data : null)),
    activateTab: (tabId: string) =>
      invokeIpc<void>('browser_activate_tab', { tabId }).then(() => undefined),
    destroyTab: (tabId: string) =>
      invokeIpc<void>('browser_destroy_tab', { tabId }).then(() => undefined),
    navigateTab: (tabId: string, url: string) =>
      invokeIpc<void>('browser_navigate_tab', { tabId, url }).then(() => undefined),
    setTabBounds: (
      tabId: string,
      bounds: { x: number; y: number; width: number; height: number },
    ) => invokeIpc<void>('browser_set_tab_bounds', { tabId, bounds }).then(() => undefined),
    dividerStripShow: (
      bounds: { x: number; y: number; width: number; height: number },
      theme: { line: string; glow: string },
      ariaLabel: string,
      lang: string,
    ) =>
      invokeIpc<void>('divider_strip_show', { bounds, theme, ariaLabel, lang }).then(
        () => undefined,
      ),
    dividerStripSetBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      invokeIpc<void>('divider_strip_set_bounds', { bounds }).then(() => undefined),
    dividerStripHide: () => invokeIpc<void>('divider_strip_hide').then(() => undefined),
    memoryPressure: () =>
      invokeIpc<boolean>('browser_memory_pressure').then((r) => r.ok && !!r.data),
    goBackTab: (tabId: string) =>
      invokeIpc<boolean>('browser_go_back_tab', { tabId }).then((r) => r.ok && !!r.data),
    goForwardTab: (tabId: string) =>
      invokeIpc<boolean>('browser_go_forward_tab', { tabId }).then((r) => r.ok && !!r.data),
    canGoBackTab: (tabId: string) =>
      invokeIpc<boolean>('browser_can_go_back_tab', { tabId }).then((r) => r.ok && !!r.data),
    canGoForwardTab: (tabId: string) =>
      invokeIpc<boolean>('browser_can_go_forward_tab', { tabId }).then((r) => r.ok && !!r.data),
    reloadTab: (tabId: string) =>
      invokeIpc<void>('browser_reload_tab', { tabId }).then(() => undefined),
    onUrlChanged: (listener: (tabId: string, url: string) => void) => {
      let active = true;
      let ul: UnlistenFn | undefined;
      void listen<{ tabId: string; url: string }>('digital-life://browser-url-changed', (event) => {
        if (active) {
          listener(event.payload.tabId, event.payload.url);
        }
      }).then((unlisten) => {
        if (active) {
          ul = unlisten;
        } else {
          /* unlisten() is typed () => void but actually async; catch rejection via wrapper */
          void Promise.resolve(unlisten()).catch(() => {});
        }
      });
      return () => {
        active = false;
        void Promise.resolve(ul?.()).catch(() => {});
      };
    },
    onMetaChanged: (
      listener: (tabId: string, meta: { title: string; favicon: string; url: string }) => void,
    ) => {
      let active = true;
      let ul: UnlistenFn | undefined;
      void listen<{ tabId: string; title: string; favicon: string; url: string }>(
        'digital-life://browser-meta-changed',
        (event) => {
          if (active) {
            const { tabId, ...meta } = event.payload;
            listener(tabId, meta);
          }
        },
      ).then((unlisten) => {
        if (active) {
          ul = unlisten;
        } else {
          /* unlisten() is typed as () => void but actually async; catch rejection via wrapper */
          void Promise.resolve(unlisten()).catch(() => {});
        }
      });
      return () => {
        active = false;
        void Promise.resolve(ul?.()).catch(() => {});
      };
    },
    muteTab: (tabId: string, muted: boolean) =>
      invoke('browser_mute_tab', { tabId, muted }).then(() => undefined),
    onPageReady: (listener: (tabId: string) => void) => {
      let active = true;
      let ul: UnlistenFn | undefined;
      void listen<{ tabId: string }>('digital-life://browser-page-ready', (event) => {
        if (active) {
          listener(event.payload.tabId);
        }
      }).then((unlisten) => {
        if (active) {
          ul = unlisten;
        } else {
          void Promise.resolve(unlisten()).catch(() => {});
        }
      });
      return () => {
        active = false;
        void Promise.resolve(ul?.()).catch(() => {});
      };
    },
    onOpenNewTab: (listener: (request: BrowserNewTabRequest) => void) => {
      let active = true;
      let ul: UnlistenFn | undefined;
      void listen<BrowserNewTabRequest>('digital-life://browser-open-new-tab', (event) => {
        if (active) {
          listener(event.payload);
        }
      }).then((unlisten) => {
        if (active) {
          ul = unlisten;
        } else {
          /* unlisten() is typed as () => void but actually async; catch rejection via wrapper */
          void Promise.resolve(unlisten()).catch(() => {});
        }
      });
      return () => {
        active = false;
        void Promise.resolve(ul?.()).catch(() => {});
      };
    },
    onAgentLink: (listener: (payload: { kind: 'url' | 'file'; url: string }) => void) => {
      let active = true;
      let ul: UnlistenFn | undefined;
      void listen<{ kind: 'url' | 'file'; url: string }>(
        'digital-life://browser-agent-link',
        (event) => {
          if (active) {
            listener({ kind: event.payload.kind, url: event.payload.url });
          }
        },
      ).then((unlisten) => {
        if (active) {
          ul = unlisten;
        } else {
          /* unlisten() is typed () => void but actually async; catch rejection via wrapper */
          void Promise.resolve(unlisten()).catch(() => {});
        }
      });
      return () => {
        active = false;
        void Promise.resolve(ul?.()).catch(() => {});
      };
    },
    setAgentIntercept: (
      origins: string[],
      enabled: boolean,
      rules?: AgentSiteRule[],
      overrides?: AgentSiteOverride[],
    ) =>
      invoke<void>('browser_set_agent_intercept', { origins, enabled, rules, overrides }).then(
        () => undefined,
        () => undefined,
      ),
    onAudioStateChanged: (
      listener: (payload: { tabId: string; isPlaying: boolean; isMuted: boolean }) => void,
    ) => {
      let active = true;
      let ul: UnlistenFn | undefined;
      void listen<{ tabId: string; isPlaying: boolean; isMuted: boolean }>(
        'digital-life://browser-audio-changed',
        (event) => {
          if (active) {
            listener(event.payload);
          }
        },
      ).then((unlisten) => {
        if (active) {
          ul = unlisten;
        } else {
          /* unlisten() is typed as () => void but actually async; catch rejection via wrapper */
          void Promise.resolve(unlisten()).catch(() => {});
        }
      });
      return () => {
        active = false;
        void Promise.resolve(ul?.()).catch(() => {});
      };
    },
    onMediaStateChanged: (listener: (payload: BrowserMediaStatePayload) => void) =>
      subscribeChannel<BrowserMediaStatePayload>('digital-life://browser-media-state', listener),
    mediaControlTab: (tabId: string, action: BrowserMediaCommand) =>
      invokeIpc<void>('browser_media_control_tab', { tabId, action }).then(() => undefined),
    setBrowserColorScheme: (resolvedTheme: 'light' | 'dark') =>
      invokeIpc<void>('browser_set_color_scheme', { colorScheme: resolvedTheme }).then(
        () => undefined,
      ),
    setZoom: (tabId: string, zoomFactor: number) =>
      invokeIpc<void>('browser_set_zoom', { tabId, zoomFactor }).then(() => undefined),
    clearCookies: (tabId: string) =>
      invokeIpc<void>('browser_clear_cookies', { tabId }).then(() => undefined),
    clearCache: (tabId: string) =>
      invokeIpc<void>('browser_clear_cache', { tabId }).then(() => undefined),
  };
}
