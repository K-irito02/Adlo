import type { StoreState } from '../StoreState';

const ACTIVE_PLATFORM_KEY = 'adl-ui:active-communicate-platform';
const COMMUNICATE_NAVIGATOR_COLLAPSED_KEY = 'adl-ui:communicate-navigator-collapsed';

export type PlatformId = 'github' | 'feishu' | 'qq' | 'wechat' | 'email';

export interface PlatformState {
  ready: boolean;
  loading: boolean;
  error: string | null;
}

export interface CommunicateSlice {
  activePlatform: PlatformId;
  platforms: Record<string, PlatformState>;
  ciPersisted: boolean;
  communicateNavigatorCollapsed: boolean;

  setActivePlatform: (platform: PlatformId) => void;
  toggleCommunicateNavigator: () => void;
  clearCiState: () => void;
}

export const createCommunicateSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): CommunicateSlice => {
  if (typeof window !== 'undefined') {
    const storedPlatform = (() => {
      try {
        const p = window.localStorage.getItem(ACTIVE_PLATFORM_KEY);
        if (p === 'github' || p === 'feishu' || p === 'qq' || p === 'wechat' || p === 'email') {
          return p as PlatformId;
        }
      } catch (err) {
        console.warn('communicateSlice: localStorage operation failed:', err);
      }
      return undefined;
    })();
    const storedCollapsed = (() => {
      try {
        return window.localStorage.getItem(COMMUNICATE_NAVIGATOR_COLLAPSED_KEY) === '1';
      } catch (err) {
        console.warn('communicateSlice: localStorage operation failed:', err);
        return false;
      }
    })();
    if (storedPlatform !== undefined || storedCollapsed) {
      const patch: Partial<StoreState> = {};
      if (storedPlatform !== undefined) {
        patch.activePlatform = storedPlatform;
      }
      if (storedCollapsed) {
        patch.communicateNavigatorCollapsed = storedCollapsed;
      }
      set(patch);
    }
  }

  return {
    activePlatform: 'github',
    platforms: {
      github: { ready: true, loading: false, error: null },
      feishu: { ready: false, loading: false, error: null },
      qq: { ready: false, loading: false, error: null },
      wechat: { ready: false, loading: false, error: null },
      email: { ready: false, loading: false, error: null },
    },
    ciPersisted: true,
    communicateNavigatorCollapsed: false,

    setActivePlatform: (platform) => {
      set({ activePlatform: platform });
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(ACTIVE_PLATFORM_KEY, platform);
        } catch (err) {
          console.warn('communicateSlice: localStorage operation failed:', err);
        }
      }
    },

    toggleCommunicateNavigator: () =>
      set((state) => {
        const next = !state.communicateNavigatorCollapsed;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(COMMUNICATE_NAVIGATOR_COLLAPSED_KEY, next ? '1' : '0');
          } catch (err) {
            console.warn('communicateSlice: localStorage operation failed:', err);
          }
        }
        return { communicateNavigatorCollapsed: next };
      }),

    clearCiState: () =>
      set({
        ciSnapshot: null,
        ciJobs: [],
        ciError: null,
      }),
  };
};
