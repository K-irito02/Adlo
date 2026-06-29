import type {
  AppPreferencePatch,
  ConfigSnapshot,
  ModelProviderPreference,
} from '@ai-digital-life/kernel';

export function applyPreferencePatch(
  config: ConfigSnapshot,
  patch: AppPreferencePatch
): ConfigSnapshot {
  const nextConfig = { ...config };

  if (patch.language) {
    nextConfig.language = patch.language;
  }
  if (patch.themeMode) {
    nextConfig.themeMode = patch.themeMode;
    nextConfig.resolvedTheme =
      patch.themeMode === 'system'
        ? typeof window !== 'undefined' &&
          (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
          ? 'dark'
          : 'light'
        : patch.themeMode;
  } else if (nextConfig.themeMode === 'system') {
    nextConfig.resolvedTheme =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
        ? 'dark'
        : 'light';
  }
  if (patch.modelPreferences) {
    const nextProviders = { ...nextConfig.modelPreferences.providers };
    for (const [providerId, providerPatch] of Object.entries(patch.modelPreferences) as [
      string,
      Partial<ModelProviderPreference>,
    ][]) {
      const key = providerId as keyof typeof nextProviders;
      if (key in nextProviders) {
        nextProviders[key] = {
          ...nextProviders[key],
          ...providerPatch,
        };
      }
    }
    nextConfig.modelPreferences = {
      ...nextConfig.modelPreferences,
      providers: nextProviders,
    };
  }

  return nextConfig;
}
