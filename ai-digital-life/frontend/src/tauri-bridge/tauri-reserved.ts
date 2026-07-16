import type { AcpConfig, CodeModeConfig, HttpApiConfig, ReservedBridge } from '../shared/ipc';
import { invokeIpc } from './tauri-shared';

export function createTauriReservedBridge() {
  return {
    acpGetStatus: () => invokeIpc<unknown>('acp_get_status'),
    acpGetConfig: () => invokeIpc<AcpConfig>('acp_get_config'),
    httpApiGetStatus: () => invokeIpc<unknown>('http_api_get_status'),
    httpApiGetConfig: () => invokeIpc<HttpApiConfig>('http_api_get_config'),
    codemodeExecute: (code) => invokeIpc<unknown>('codemode_execute', { code }),
    codemodeGetConfig: () => invokeIpc<CodeModeConfig>('codemode_get_config'),
  } satisfies ReservedBridge;
}
