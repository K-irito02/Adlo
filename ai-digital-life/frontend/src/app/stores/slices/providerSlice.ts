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
}

export const createProviderSlice = (
  _set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): ProviderSlice => ({
  providers: [],
  selectedProviderId: null,
  selectedModelId: null,
  recentModelIds: [],
  isFetchingProviders: false,
  connectionTestResults: {},
  testingProviderId: null,
});
