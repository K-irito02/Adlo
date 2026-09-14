import type { SettingsGroupId } from '@shared/ipc';
import type { CopyDict } from '../../i18n';

/**
 * 设置导航的组顺序与标签（单一真源）。
 * 独立于 `SettingsNav.tsx`：组件文件不得导出常量（`react-refresh/only-export-components`），
 * 且 `SettingsPanel` 需要用它把失效的 `activeGroup` 回退到第一个组。
 */
export const SETTINGS_GROUPS: { id: SettingsGroupId; labelKey: keyof CopyDict }[] = [
  { id: 'general', labelKey: 'settingsGeneral' },
  { id: 'workspace', labelKey: 'settingsWorkspace' },
  { id: 'storage', labelKey: 'storageTitle' },
  { id: 'shortcuts', labelKey: 'settingsShortcuts' },
  { id: 'browser', labelKey: 'settingsBrowser' },
  { id: 'dsh', labelKey: 'settingsDsh' },
];
