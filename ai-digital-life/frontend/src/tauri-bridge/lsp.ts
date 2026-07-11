import type { LspBridge, SymbolInfo, DiagnosticInfo } from '../shared/ipc';
import { invokeIpc } from './shared';

export function createTauriLspBridge(): LspBridge {
  return {
    startServer: (workspaceId, workspaceRoot, server) =>
      invokeIpc<void>('lsp_start_server', { workspaceId, workspaceRoot, server }),
    stopServer: (workspaceId, server) =>
      invokeIpc<void>('lsp_stop_server', { workspaceId, server }),
    getSymbols: (workspaceId, filePath) =>
      invokeIpc<SymbolInfo[]>('lsp_get_symbols', { workspaceId, filePath }),
    getDiagnostics: (workspaceId, filePath) =>
      invokeIpc<DiagnosticInfo[]>('lsp_get_diagnostics', { workspaceId, filePath }),
    gotoDefinition: (workspaceId, filePath, line, column) =>
      invokeIpc<SymbolInfo | null>('lsp_goto_definition', {
        workspaceId,
        filePath,
        line,
        column,
      }),
  };
}
