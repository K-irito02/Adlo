import type {
  AppInfo,
  LanguageCode,
  ModelProviderId,
  SettingItem,
  ThemeMode,
} from '@ai-digital-life/kernel';
import type { CopyDict } from '../i18n';

export function buildSettingsItems(t: CopyDict, appInfo?: AppInfo): SettingItem[] {
  const providers = appInfo?.config.modelPreferences.providers;
  const items: SettingItem[] = [
    {
      id: 'language',
      groupId: 'general',
      label: t.settingsLanguage,
      description: t.language,
      type: 'select',
      value: appInfo?.config.language ?? 'zh-CN',
      options: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    },
    {
      id: 'themeMode',
      groupId: 'general',
      label: t.settingsTheme,
      description: t.theme,
      type: 'select',
      value: appInfo?.config.themeMode ?? 'system',
      options: [
        { value: 'system', label: t.themeSystem },
        { value: 'light', label: t.themeLight },
        { value: 'dark', label: t.themeDark },
      ],
    },
    {
      id: 'approvalMode',
      groupId: 'agent',
      label: t.settingsAutoApproval,
      description: t.approvalPolicy,
      type: 'readonly',
      value: 'manual',
    },
    {
      id: 'workspacePath',
      groupId: 'workspace',
      label: t.workspaceLabel,
      description: t.openWorkspace,
      type: 'readonly',
      value: appInfo?.currentWorkspace?.rootPath ?? '-',
    },
  ];

  for (const providerId of ['deepseek', 'minimax'] as ModelProviderId[]) {
    const provider = providers?.[providerId];
    if (!provider) {
      continue;
    }
    items.push(
      {
        id: `model:${providerId}:enabled`,
        groupId: 'model',
        label: `${providerId} ${t.providerEnabled}`,
        description: t.modelSelector,
        type: 'toggle',
        value: provider.enabled,
      },
      {
        id: `model:${providerId}:priority`,
        groupId: 'model',
        label: `${providerId} ${t.providerPriority}`,
        description: t.modelSettings,
        type: 'input',
        value: provider.priority,
      },
      {
        id: `model:${providerId}:modelId`,
        groupId: 'model',
        label: `${providerId} ${t.providerModelId}`,
        description: t.modelSettings,
        type: 'input',
        value: provider.modelId,
      }
    );
  }

  return items;
}

export function preferencePatchFromSettingChange(
  id: string,
  value: string | boolean | number
):
  | {
      language?: LanguageCode;
      themeMode?: ThemeMode;
      modelPreferences?: Partial<
        Record<ModelProviderId, { enabled?: boolean; priority?: number; modelId?: string }>
      >;
    }
  | undefined {
  if (id === 'language') {
    return { language: value as LanguageCode };
  }
  if (id === 'themeMode') {
    return { themeMode: value as ThemeMode };
  }
  if (!id.startsWith('model:')) {
    return undefined;
  }

  const [, providerIdRaw, field] = id.split(':');
  const providerId = providerIdRaw as ModelProviderId;
  if (field === 'enabled') {
    return { modelPreferences: { [providerId]: { enabled: Boolean(value) } } };
  }
  if (field === 'priority') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return { modelPreferences: { [providerId]: { priority: parsed } } };
  }
  if (field === 'modelId') {
    return { modelPreferences: { [providerId]: { modelId: String(value) } } };
  }
  return undefined;
}
