import type { AppBridge } from '../shared/ipc';
import type {
  AppInfo,
  AppPreferencePatch,
  HealthSnapshot,
  RuntimeDiagnosticsSnapshot,
  UpdatePreferencesResult,
} from '@ai-digital-life/kernel';
import { invokeIpc } from './tauri-shared';

export function createTauriAppBridge(): AppBridge {
  return {
    getInfo: () => invokeIpc<AppInfo>('app_get_info'),
    getHealth: () => invokeIpc<HealthSnapshot>('app_get_health'),
    getDiagnostics: () => invokeIpc<RuntimeDiagnosticsSnapshot>('app_get_diagnostics'),
    updatePreferences: (patch: AppPreferencePatch) =>
      invokeIpc<UpdatePreferencesResult>('app_update_preferences', { patch }),
  };
}
