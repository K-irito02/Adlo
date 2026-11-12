import type {
  AppPreferencePatch,
  ConfigSnapshot,
  ModelProviderPreference,
} from './ipc-types.generated';
import { resolveCurrentTheme } from './resolveTheme';
import { normalizeAgentSiteEntries } from './originWhitelist';
import {
  defaultAgentSiteRules,
  normalizeAgentSiteOverrides,
  normalizeAgentSiteRules,
} from './agentSiteRules';

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
  if (patch.linkOpenMethod !== undefined) {
    nextConfig.linkOpenMethod = patch.linkOpenMethod;
  }
  if (patch.fileOpenMethod !== undefined) {
    nextConfig.fileOpenMethod = patch.fileOpenMethod;
  }
  if (patch.agentLinkIntercept !== undefined) {
    nextConfig.agentLinkIntercept = patch.agentLinkIntercept;
  }
  if (patch.agentSiteWhitelist !== undefined) {
    // 与设置变更路径同源归一（去 path/query、去非法、去重），后端推送/批量恢复
    // 的脏数据不在此落盘（见事项 5 审查 S-F3）。
    nextConfig.agentSiteWhitelist = normalizeAgentSiteEntries(patch.agentSiteWhitelist);
  }
  if (patch.resetAgentSiteRules === true) {
    // Reset means "use built-ins from now on". Materialize a fresh default copy so
    // the UI has an unambiguous list to render until the next backend snapshot.
    nextConfig.agentSiteRules = defaultAgentSiteRules();
  } else if (patch.agentSiteRules !== undefined) {
    nextConfig.agentSiteRules = normalizeAgentSiteRules(patch.agentSiteRules);
  }
  if (patch.resetAgentSiteOverrides === true) {
    nextConfig.agentSiteOverrides = [];
  } else if (patch.resetAgentSiteOverride !== undefined) {
    nextConfig.agentSiteOverrides = normalizeAgentSiteOverrides(
      (nextConfig.agentSiteOverrides ?? []).filter(
        (entry) => entry.origin !== patch.resetAgentSiteOverride,
      ),
    );
  } else if (patch.agentSiteOverrides !== undefined) {
    nextConfig.agentSiteOverrides = normalizeAgentSiteOverrides(patch.agentSiteOverrides);
  }
  if (patch.browserSuspendWhitelistEnabled !== undefined) {
    nextConfig.browserSuspendWhitelistEnabled = patch.browserSuspendWhitelistEnabled;
  }
  if (patch.browserSuspendWhitelist !== undefined) {
    // 与智能体白名单同源归一，脏数据不落盘。
    nextConfig.browserSuspendWhitelist = normalizeAgentSiteEntries(patch.browserSuspendWhitelist);
  }

  return nextConfig;
}
