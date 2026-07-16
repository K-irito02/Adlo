import { IpcErrorCode } from "../shared/ipc";
import type { ReservedBridge } from "../shared/ipc";

export const mockReserved: ReservedBridge = {
  acpGetStatus: async () => ({
    ok: false,
    error: { code: IpcErrorCode.INTERNAL_ERROR, message: 'ACP not implemented' },
  }),
  acpGetConfig: async () => ({ ok: true, data: { enabled: false, port: null } }),
  httpApiGetStatus: async () => ({
    ok: false,
    error: { code: IpcErrorCode.INTERNAL_ERROR, message: 'HTTP API not implemented' },
  }),
  httpApiGetConfig: async () => ({
    ok: true,
    data: { enabled: false, port: null, cors_origins: [] },
  }),
  codemodeExecute: async () => ({
    ok: false,
    error: { code: IpcErrorCode.INTERNAL_ERROR, message: 'CodeMode not implemented' },
  }),
  codemodeGetConfig: async () => ({
    ok: true,
    data: { enabled: false, max_concurrency: 8, timeout_ms: 30000, max_output_bytes: 1048576 },
  }),
};
