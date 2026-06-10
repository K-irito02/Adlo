import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../../stores/slicedStore';
import { useAppActions } from '../../../hooks/useAppActions';
import {
  buildSettingsItems,
  preferencePatchFromSettingChange,
} from '../../../utils/settingsViewModel';
import type { SettingsPanelProps } from '../types';
import type { RightPanelProps } from '../../RightPanel';

export function useSettingsPanelProps(panelProps: RightPanelProps): SettingsPanelProps {
  const { t } = panelProps;
  const appInfo = useAppStore(useShallow((s) => s.appInfo));
  const actions = useAppActions();

  const settings = useMemo(() => buildSettingsItems(t, appInfo), [appInfo, t]);

  const handleChangeSetting = useCallback(
    (id: string, value: string | boolean | number) => {
      const patch = preferencePatchFromSettingChange(id, value);
      if (patch) {
        void actions.updatePreferences(patch);
      }
    },
    [actions]
  );

  return {
    t,
    settings,
    onChangeSetting: handleChangeSetting,
  };
}
