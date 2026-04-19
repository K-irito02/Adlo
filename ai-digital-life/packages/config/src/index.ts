import fs from "node:fs/promises";
import path from "node:path";
import {
  type AppPreferencePatch,
  type ConfigSnapshot,
  type LanguageCode,
  type LogLevel,
  type ModelPreferences,
  type ModelProviderId,
  type ModelProviderPreference,
  type ResolvedTheme,
  type ThemeMode
} from "@ai-digital-life/kernel";

interface StoredConfigFile {
  language?: string;
  themeMode?: string;
  logLevel?: string;
  maxRecentWorkspaces?: number;
  modelPreferences?: {
    providers?: Partial<Record<ModelProviderId, Partial<ModelProviderPreference>>>;
  };
}

const DEFAULT_MODEL_PREFERENCES: ModelPreferences = {
  providers: {
    deepseek: {
      enabled: true,
      priority: 1,
      modelId: "deepseek-chat"
    },
    minimax: {
      enabled: true,
      priority: 3,
      modelId: "MiniMax-M2.5"
    }
  }
};

export const DEFAULT_CONFIG: ConfigSnapshot = {
  language: "zh-CN",
  themeMode: "system",
  resolvedTheme: "light",
  logLevel: "info",
  maxRecentWorkspaces: 8,
  modelPreferences: DEFAULT_MODEL_PREFERENCES
};

export function resolveThemeMode(themeMode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (themeMode === "system") {
    return prefersDark ? "dark" : "light";
  }

  return themeMode;
}

export function validateLanguage(value: unknown): LanguageCode {
  return value === "en-US" ? "en-US" : "zh-CN";
}

export function validateThemeMode(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function validateLogLevel(value: unknown): LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error" ? value : "info";
}

function validateProviderPreference(
  value: unknown,
  fallback: ModelProviderPreference
): ModelProviderPreference {
  const candidate = (value ?? {}) as Partial<ModelProviderPreference>;
  const priority =
    typeof candidate.priority === "number" && Number.isFinite(candidate.priority)
      ? Math.max(1, Math.min(10, Math.floor(candidate.priority)))
      : fallback.priority;
  const modelId = typeof candidate.modelId === "string" && candidate.modelId.trim() ? candidate.modelId.trim() : fallback.modelId;

  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : fallback.enabled,
    priority,
    modelId
  };
}

function validateModelPreferences(value: unknown): ModelPreferences {
  const candidate = (value ?? {}) as StoredConfigFile["modelPreferences"];
  return {
    providers: {
      deepseek: validateProviderPreference(candidate?.providers?.deepseek, DEFAULT_MODEL_PREFERENCES.providers.deepseek),
      minimax: validateProviderPreference(candidate?.providers?.minimax, DEFAULT_MODEL_PREFERENCES.providers.minimax)
    }
  };
}

export function validateConfigFile(input: unknown, prefersDark = false): ConfigSnapshot {
  const candidate = (input ?? {}) as StoredConfigFile;
  const themeMode = validateThemeMode(candidate.themeMode);

  return {
    language: validateLanguage(candidate.language),
    themeMode,
    resolvedTheme: resolveThemeMode(themeMode, prefersDark),
    logLevel: validateLogLevel(candidate.logLevel),
    maxRecentWorkspaces:
      typeof candidate.maxRecentWorkspaces === "number" && candidate.maxRecentWorkspaces > 0
        ? Math.min(20, Math.floor(candidate.maxRecentWorkspaces))
        : DEFAULT_CONFIG.maxRecentWorkspaces,
    modelPreferences: validateModelPreferences(candidate.modelPreferences)
  };
}

export async function loadConfig(configDir: string, prefersDark = false): Promise<ConfigSnapshot> {
  const configFilePath = path.join(configDir, "config.json");

  try {
    const raw = await fs.readFile(configFilePath, "utf8");
    return validateConfigFile(JSON.parse(raw), prefersDark);
  } catch {
    return {
      ...DEFAULT_CONFIG,
      resolvedTheme: resolveThemeMode(DEFAULT_CONFIG.themeMode, prefersDark)
    };
  }
}

function toStoredConfigFile(snapshot: ConfigSnapshot): StoredConfigFile {
  return {
    language: snapshot.language,
    themeMode: snapshot.themeMode,
    logLevel: snapshot.logLevel,
    maxRecentWorkspaces: snapshot.maxRecentWorkspaces,
    modelPreferences: snapshot.modelPreferences
  };
}

export function applyConfigPatch(
  currentConfig: ConfigSnapshot,
  patch: AppPreferencePatch,
  prefersDark = false
): ConfigSnapshot {
  const nextThemeMode = patch.themeMode ?? currentConfig.themeMode;

  return {
    ...currentConfig,
    language: patch.language ?? currentConfig.language,
    themeMode: nextThemeMode,
    resolvedTheme: resolveThemeMode(nextThemeMode, prefersDark),
    modelPreferences: patch.modelPreferences
      ? {
          providers: {
            deepseek: {
              ...currentConfig.modelPreferences.providers.deepseek,
              ...patch.modelPreferences.deepseek
            },
            minimax: {
              ...currentConfig.modelPreferences.providers.minimax,
              ...patch.modelPreferences.minimax
            }
          }
        }
      : currentConfig.modelPreferences
  };
}

export async function saveConfig(configDir: string, snapshot: ConfigSnapshot): Promise<void> {
  const configFilePath = path.join(configDir, "config.json");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configFilePath, `${JSON.stringify(toStoredConfigFile(snapshot), null, 2)}\n`, "utf8");
}
