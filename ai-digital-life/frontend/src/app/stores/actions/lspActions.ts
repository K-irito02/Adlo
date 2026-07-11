import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { clearError, captureError } from '../shared';

export function createLspActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    lspStartServer: async (workspaceId: string, workspaceRoot: string, server: string) => {
      clearError(get);
      const result = await window.digitalLife.lsp.startServer(workspaceId, workspaceRoot, server);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ lspActiveServers: [...get().lspActiveServers, server] });
    },

    lspStopServer: async (workspaceId: string, server: string) => {
      clearError(get);
      const result = await window.digitalLife.lsp.stopServer(workspaceId, server);
      if (!result.ok) {
        captureError(get, result.error);
        return;
      }
      set({ lspActiveServers: get().lspActiveServers.filter((s) => s !== server) });
    },

    lspGetSymbols: async (workspaceId: string, filePath: string) => {
      clearError(get);
      const result = await window.digitalLife.lsp.getSymbols(workspaceId, filePath);
      if (!result.ok) {
        captureError(get, result.error);
        return [];
      }
      return result.data;
    },

    lspGetDiagnostics: async (workspaceId: string, filePath?: string) => {
      clearError(get);
      const result = await window.digitalLife.lsp.getDiagnostics(workspaceId, filePath);
      if (!result.ok) {
        captureError(get, result.error);
        return [];
      }
      set({ lspDiagnostics: result.data });
      return result.data;
    },
  };
}
