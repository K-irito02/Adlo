import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { PermissionRule } from '@shared/ipc/permission';
import { clearError, captureError } from '../shared';
const SCOPE = 'permission';

export function createPermissionActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    fetchPermissionRules: async (dataDir: string) => {
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.permission.listPermissionRules(dataDir);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ permissionConfig: result.data });
    },

    addPermissionRule: async (dataDir: string, rule: PermissionRule) => {
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.permission.addPermissionRule(dataDir, rule);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ permissionConfig: result.data });
    },

    deletePermissionRule: async (dataDir: string, index: number) => {
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.permission.deletePermissionRule(dataDir, index);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ permissionConfig: result.data });
    },

    setPermissionIncludeDefaults: async (dataDir: string, include: boolean) => {
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.permission.setPermissionIncludeDefaults(dataDir, include);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ permissionConfig: result.data });
    },
  };
}
