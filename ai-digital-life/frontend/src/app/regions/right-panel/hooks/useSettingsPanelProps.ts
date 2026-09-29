import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { useTCopy } from '@i18n/useTCopy';
import { buildSettingsItems, preferencePatchFromSettingChange } from '@utils/settingsViewModel';
import type { SettingsPanelProps } from '../types';
import type { RightPanelProps } from '@regions/RightPanel';

export function useSettingsPanelProps(_panelProps: RightPanelProps): SettingsPanelProps {
  const { t } = useTCopy();
  const appInfo = useAppStore(useShallow((s) => s.appInfo));
  const actions = useAppActions();

  const settings = useMemo(() => buildSettingsItems(t, appInfo), [appInfo, t]);

  const handleChangeSetting = useCallback(
    (id: string, value: string | boolean | number) => {
      const patch = preferencePatchFromSettingChange(id, value);
      console.error('[ADL-DEBUG-SETTINGS] onChangeSetting', { id, value, patch });
      if (patch) {
        void actions.updatePreferences(patch);
      } else {
        console.error('[ADL-DEBUG-SETTINGS] onChangeSetting no patch for id', { id });
      }
    },
    [actions],
  );

  return {
    settings,
    onChangeSetting: handleChangeSetting,
  };
}
