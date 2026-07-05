import type { ProviderInfo } from '@shared/ipc';
import type { StoreState } from '../StoreState';

export interface ProviderSlice {
  providers: ProviderInfo[];
  configuredProviders: string[];
  isFetchingProviders: boolean;

  setProviders: (providers: ProviderInfo[]) => void;
  setConfiguredProviders: (configured: string[]) => void;
  setIsFetchingProviders: (fetching: boolean) => void;
}

export const createProviderSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): ProviderSlice => ({
  providers: [],
  configuredProviders: [],
  isFetchingProviders: false,

  setProviders: (providers) => set({ providers }),
  setConfiguredProviders: (configured) => set({ configuredProviders: configured }),
  setIsFetchingProviders: (fetching) => set({ isFetchingProviders: fetching }),
});
