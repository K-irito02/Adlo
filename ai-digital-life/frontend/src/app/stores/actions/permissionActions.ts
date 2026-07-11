import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { PermissionRule } from '@shared/ipc';
import { clearError, captureTypedError } from '../shared';

export function createPermissionActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
) {
  return {
    fetchPermissionRules: async (dataDir: string) => {
      clearError(get);
      const bridge = window.digitalLife;
      const result = await bridge.permission.listPermissionRules(dataDir);
      if (!result.ok) {
        captureTypedError(get, result.error);
        return;
      }
      set({ permissionConfig: result.data });
    },

    addPermissionRule: async (dataDir: string, rule: PermissionRule) => {
      clearError(get);
      const bridge = window.digitalLife;
      const result = await bridge.permission.addPermissionRule(dataDir, rule);
      if (!result.ok) {
        captureTypedError(get, result.error);
        return;
      }
      set({ permissionConfig: result.data });
    },

    deletePermissionRule: async (dataDir: string, index: number) => {
      clearError(get);
      const bridge = window.digitalLife;
      const result = await bridge.permission.deletePermissionRule(dataDir, index);
      if (!result.ok) {
        captureTypedError(get, result.error);
        return;
      }
      set({ permissionConfig: result.data });
    },

    setPermissionIncludeDefaults: async (dataDir: string, include: boolean) => {
      clearError(get);
      const bridge = window.digitalLife;
      const result = await bridge.permission.setPermissionIncludeDefaults(dataDir, include);
      if (!result.ok) {
        captureTypedError(get, result.error);
        return;
      }
      set({ permissionConfig: result.data });
    },
  };
}
