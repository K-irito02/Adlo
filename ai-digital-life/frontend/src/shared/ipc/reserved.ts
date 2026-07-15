import type { IpcResult } from '@ai-digital-life/kernel';

export type { IpcResult };

export interface AcpConfig {
  enabled: boolean;
  port: number | null;
}

export interface HttpApiConfig {
  enabled: boolean;
  port: number | null;
  cors_origins: string[];
}

export interface CodeModeConfig {
  enabled: boolean;
  max_concurrency: number;
  timeout_ms: number;
  max_output_bytes: number;
}

export interface ReservedBridge {
  acpGetStatus(): Promise<IpcResult<unknown>>;
  acpGetConfig(): Promise<IpcResult<AcpConfig>>;
  httpApiGetStatus(): Promise<IpcResult<unknown>>;
  httpApiGetConfig(): Promise<IpcResult<HttpApiConfig>>;
  codemodeExecute(code: string): Promise<IpcResult<unknown>>;
  codemodeGetConfig(): Promise<IpcResult<CodeModeConfig>>;
}
