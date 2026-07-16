import type { LspBridge } from "../shared/ipc";

export const mockLsp: LspBridge = {
  startServer: async () => ({ ok: true, data: undefined }),
  stopServer: async () => ({ ok: true, data: undefined }),
  getSymbols: async () => ({ ok: true, data: [] }),
  getDiagnostics: async () => ({ ok: true, data: [] }),
  gotoDefinition: async () => ({ ok: true, data: null }),
};
