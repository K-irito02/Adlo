import type { StoreState } from "../StoreState";
import type { StoreApi } from "zustand";

export function createCommandActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
  return {
    runCommand: async (command: string, argsText: string) => {
      if (!command.trim()) return;
      const args = argsText
        .split(/\s+/)
        .map((item: string) => item.trim())
        .filter(Boolean);
      const result = await window.digitalLife.command.run({
        command: command.trim(),
        args,
      });
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ latestCommandRun: result.data });
      await get().refreshTaskCenter();
      await get().fetchAuditEntries(40);
      await get().fetchCommandHistory();
      await get().fetchGitStatus();
    },
  };
}
