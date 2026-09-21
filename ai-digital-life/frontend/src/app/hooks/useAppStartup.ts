import { useEffect, useState } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import type { CopyDict, Locale } from '../i18n/types';
import { loadLocale } from '../i18n/i18nLoader';
import { useAppActions } from './useAppActions';
import { useThemeSync } from './useThemeSync';
import { initSiteMetaCache } from '@utils/siteMetaCache';
import { pageMetaClient } from '@utils/pageMetaClient';
import { collectWarmupUrls } from '@utils/warmupUrls';

export function useAppStartup(appInfo: AppInfo | undefined) {
  const actions = useAppActions();
  const [t, setT] = useState<CopyDict | undefined>(undefined);
  const [locale, setLocale] = useState<Locale>('zh-CN');

  useThemeSync(appInfo);

  useEffect(() => {
    if (!appInfo) {
      return;
    }
    const lang = (appInfo.config.language ?? 'zh-CN') as Locale;
    setLocale(lang);
    loadLocale(lang).then(setT);
  }, [appInfo]);

  useEffect(() => {
    if (!t) {
      return;
    }
    void window.digitalLife.window.setTitle(t['brandHoverName']);
  }, [t]);

  useEffect(() => {
    // 启动恢复（Task 26）：bootstrap 完成后单次尝试恢复上次打开的文件。
    // 恢复失败只置瞬态提示、不抛错；此处无轮询/重试（重试循环已由 T18–21 删除）。
    void actions.bootstrap().finally(() => {
      void actions.restoreLastOpenedFile();
    });
    void initSiteMetaCache();
  }, [actions, actions.bootstrap]);

  useEffect(() => {
    void initSiteMetaCache();
    // 单次收集：store 构造期已同步水合（hydrateAll），首次收集即见全量持久化数据，
    // 无需等待延迟水合（requestIdleCallback/setTimeout 机制已由 T7/T9 删除）。
    const urls = collectWarmupUrls();
    if (urls.length > 0) {
      void pageMetaClient.warmup(urls);
    }
  }, []);

  useEffect(() => {
    return window.digitalLife.workspace.onFileChanged((event) => {
      actions.markExternalFileChange(event);
    });
  }, [actions, actions.markExternalFileChange]);

  useEffect(() => {
    return actions.subscribeWorkspaceFilesChanged();
  }, [actions]);

  return {
    locale,
    t,
  };
}
