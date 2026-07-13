import { useEffect, useState } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import type { CopyDict, Locale } from '../i18n/types';
import { loadLocale } from '../i18n/i18nLoader';
import { useAppActions } from './useAppActions';
import { useThemeSync } from './useThemeSync';
import { useTaskCenterPolling } from './useTaskCenterPolling';

export function useAppStartup(appInfo: AppInfo | undefined) {
  const actions = useAppActions();
  const [t, setT] = useState<CopyDict | undefined>(undefined);
  const [locale, setLocale] = useState<Locale>('zh-CN');

  useThemeSync(appInfo);
  useTaskCenterPolling(appInfo);

  useEffect(() => {
    if (!appInfo) return;
    const lang = (appInfo.config.language ?? 'zh-CN') as Locale;
    setLocale(lang);
    loadLocale(lang).then(setT);
  }, [appInfo]);

  useEffect(() => {
    if (!t) return;
    void window.digitalLife.window.setTitle(t['brandHoverName']);
  }, [t]);

  useEffect(() => {
    if (!t) return;
    void actions.bootstrap();
  }, [t, actions, actions.bootstrap]);

  useEffect(() => {
    return window.digitalLife.workspace.onFileChanged((event) => {
      actions.markExternalFileChange(event);
    });
  }, [actions, actions.markExternalFileChange]);

  return {
    locale,
    t,
  };
}
