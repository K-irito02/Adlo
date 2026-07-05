import type { IpcResult } from '@ai-digital-life/kernel';

export type SymbolKind =
  | 'file'
  | 'module'
  | 'namespace'
  | 'package'
  | 'class'
  | 'method'
  | 'property'
  | 'field'
  | 'constructor'
  | 'enum'
  | 'interface'
  | 'function'
  | 'variable'
  | 'constant'
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'key'
  | 'null'
  | 'struct'
  | 'event'
  | 'operator'
  | 'type_parameter';

export type DiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

export interface DefinitionLocation {
  file_path: string;
  line: number;
  column: number;
  end_line: number | null;
  end_column: number | null;
}

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  location: DefinitionLocation;
  container_name: string | null;
}

export interface DiagnosticInfo {
  file_path: string;
  line: number;
  column: number;
  severity: DiagnosticSeverity;
  message: string;
  source: string | null;
  code: string | null;
}

export interface LspBridge {
  startServer(workspaceId: string, workspaceRoot: string, server: string): Promise<IpcResult<void>>;
  stopServer(workspaceId: string, server: string): Promise<IpcResult<void>>;
  getSymbols(workspaceId: string, filePath: string): Promise<IpcResult<SymbolInfo[]>>;
  getDiagnostics(workspaceId: string, filePath?: string): Promise<IpcResult<DiagnosticInfo[]>>;
  gotoDefinition(
    workspaceId: string,
    filePath: string,
    line: number,
    column: number
  ): Promise<IpcResult<SymbolInfo | null>>;
}
