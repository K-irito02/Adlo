import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { postMutationRefresh, clearError, captureError } from '../shared';

export function createCommandActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [runCommand - 在工作区上下文中执行 shell 命令]
     * @writes commandSlice.latestCommandRun
     * @see shared/ipc.ts → command.run
     * @see mock-bridge.ts → command.run
     * @see preview-bridge/index.ts → command.run
     */
    runCommand: async (command: string, argsText: string) => {
      if (!command.trim()) return;
      clearError(get);
      const args = argsText
        .split(/\s+/)
        .map((item: string) => item.trim())
        .filter(Boolean);
      const result = await window.digitalLife.command.run({
        command: command.trim(),
        args,
      });
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ latestCommandRun: result.data });
      await postMutationRefresh(get);
    },
  };
}
