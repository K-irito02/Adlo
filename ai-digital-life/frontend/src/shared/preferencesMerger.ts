import type {
  AppPreferencePatch,
  ConfigSnapshot,
  ModelProviderPreference,
} from './ipc-types.generated';
import { resolveCurrentTheme } from './resolveTheme';

export function applyPreferencePatch(
  config: ConfigSnapshot,
  patch: AppPreferencePatch,
): ConfigSnapshot {
  const nextConfig = { ...config };

  if (patch.language) {
    nextConfig.language = patch.language;
  }
  if (patch.themeMode) {
    nextConfig.themeMode = patch.themeMode;
    nextConfig.resolvedTheme = resolveCurrentTheme(patch.themeMode);
  } else if (nextConfig.themeMode === 'system') {
    nextConfig.resolvedTheme = resolveCurrentTheme('system');
  }
  if (patch.logLevel) {
    nextConfig.logLevel = patch.logLevel;
  }
  if (patch.terminalLogMode) {
    nextConfig.terminalLogMode = patch.terminalLogMode;
  }
  if (patch.debugLogMode) {
    nextConfig.debugLogMode = patch.debugLogMode;
  }
  if (patch.modelPreferences) {
    const nextProviders = { ...nextConfig.modelPreferences.providers };
    for (const [providerId, providerPatch] of Object.entries(patch.modelPreferences) as [
      string,
      Partial<ModelProviderPreference>,
    ][]) {
      const key = providerId as keyof typeof nextProviders;
      const existing = nextProviders[key] ?? {
        enabled: true,
        priority: 10,
        modelId: providerId,
        enabledModels: null,
      };
      nextProviders[key] = {
        enabled: providerPatch.enabled ?? existing.enabled,
        priority: providerPatch.priority ?? existing.priority,
        modelId: providerPatch.modelId ?? existing.modelId,
        enabledModels:
          'enabledModels' in providerPatch ? providerPatch.enabledModels! : existing.enabledModels,
      };
    }
    nextConfig.modelPreferences = {
      ...nextConfig.modelPreferences,
      providers: nextProviders,
    };
  }
  if (patch.keybinds) {
    nextConfig.keybinds = { ...patch.keybinds };
  }
  if (patch.fonts) {
    nextConfig.fonts = {
      ...nextConfig.fonts,
      ...(patch.fonts.uiFont !== undefined ? { uiFont: patch.fonts.uiFont } : {}),
      ...(patch.fonts.codeFont !== undefined ? { codeFont: patch.fonts.codeFont } : {}),
      ...(patch.fonts.terminalFont !== undefined ? { terminalFont: patch.fonts.terminalFont } : {}),
    };
  }
  if (patch.maxConcurrentWorkspaces !== undefined) {
    nextConfig.maxConcurrentWorkspaces = patch.maxConcurrentWorkspaces;
  }
  if (patch.workspacePriorityIds !== undefined) {
    nextConfig.workspacePriorityIds = patch.workspacePriorityIds;
  }
  if (patch.workspaceDeferredIds !== undefined) {
    nextConfig.workspaceDeferredIds = patch.workspaceDeferredIds;
  }
  if (patch.workspaceNaturalOrder !== undefined) {
    nextConfig.workspaceNaturalOrder = patch.workspaceNaturalOrder;
  }
  if (patch.browserInactiveTabSuspendMs !== undefined) {
    nextConfig.browserInactiveTabSuspendMs = patch.browserInactiveTabSuspendMs;
  }

  return nextConfig;
}
