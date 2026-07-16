import type { AppBridge } from '../shared/ipc';
import type {
  AppInfo,
  AppPreferencePatch,
  HealthSnapshot,
  ModelGatewayHealthSnapshot,
  RuntimeDiagnosticsSnapshot,
} from '@ai-digital-life/kernel';
import { invokeIpc } from './tauri-shared';

export function createTauriAppBridge(): AppBridge {
  return {
    getInfo: () => invokeIpc<AppInfo>('app_get_info'),
    getHealth: () => invokeIpc<HealthSnapshot>('app_get_health'),
    getDiagnostics: () => invokeIpc<RuntimeDiagnosticsSnapshot>('app_get_diagnostics'),
    getModelHealth: () => invokeIpc<ModelGatewayHealthSnapshot>('app_get_model_health'),
    updatePreferences: (patch: AppPreferencePatch) =>
      invokeIpc<AppInfo>('app_update_preferences', { patch }),
  };
}
