import type { StoreState } from "../StoreState";
import type { StoreApi } from "zustand";
import { postMutationRefresh, clearError, captureError } from "../shared";

export function createCommandActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
  return {
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
