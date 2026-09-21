import type { StoreState } from '../StoreState';
import { persistField } from '../persisted/apply';
import { persist } from '../persisted/persist';

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
  // 初始值即登记表 fallback；真实值由 hydrateAll 在 store 创建后同步写入（唯一水合时机）。
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
      set(persistField('adl:ui.communicatePlatform', platform));
    },

    toggleCommunicateNavigator: () =>
      set((state) => {
        const next = !state.communicateNavigatorCollapsed;
        persist('adl:ui.communicateNavigatorCollapsed', next);
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
