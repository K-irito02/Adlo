import type { ProviderStatus, ConnectionTestResult } from '@shared/ipc/provider';
import type { StoreState } from '../StoreState';

export interface ProviderSlice {
  providers: ProviderStatus[];
  selectedProviderId: string | null;
  selectedModelId: string | null;
  recentModelIds: string[];
  isFetchingProviders: boolean;
  connectionTestResults: Record<string, ConnectionTestResult>;
  testingProviderId: string | null;
  /** In-memory API key inputs per provider. Never persisted to disk/localStorage.
      Once a user types a key it stays until they manually clear it, so test/fetch
      can use the typed value without requiring a prior save. */
  apiKeyInputs: Record<string, string>;
  /** Providers whose key input the user edited this session (typed or cleared).
      Used to prevent the persisted-key prefill from re-filling an input the user
      deliberately emptied. In-memory only; resets on restart. */
  keyInputTouched: Record<string, boolean>;
  setApiKeyInput: (providerId: string, value: string) => void;
}

export const createProviderSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): ProviderSlice => ({
  providers: [],
  selectedProviderId: null,
  selectedModelId: null,
  recentModelIds: [],
  isFetchingProviders: false,
  connectionTestResults: {},
  testingProviderId: null,
  apiKeyInputs: {},
  keyInputTouched: {},
  setApiKeyInput: (providerId: string, value: string) =>
    set((state) => ({
      apiKeyInputs: { ...state.apiKeyInputs, [providerId]: value },
      keyInputTouched: { ...state.keyInputTouched, [providerId]: true },
    })),
});
