import type { PermissionRulesetConfig } from '@shared/ipc';
import type { StoreState } from '../StoreState';

export interface PermissionSlice {
  permissionConfig: PermissionRulesetConfig;
  setPermissionConfig: (config: PermissionRulesetConfig) => void;
}

export const createPermissionSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): PermissionSlice => ({
  permissionConfig: { custom_rules: [], include_defaults: true },
  setPermissionConfig: (config) => set({ permissionConfig: config }),
});
