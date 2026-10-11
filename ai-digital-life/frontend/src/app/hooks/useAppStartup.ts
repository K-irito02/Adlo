import { useEffect, useState } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import type { CopyDict, Locale } from '../i18n/types';
import { loadLocale } from '../i18n/i18nLoader';
import { resolveAppLanguage } from '../i18n/resolveLanguage';
import { useAppActions } from './useAppActions';
import { useThemeSync } from './useThemeSync';
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '../../tauri-bridge';
import { onAdServerReachabilityChange } from '../../preview-bridge/preview-reachability';
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
    const lang = resolveAppLanguage(appInfo.config.language);
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

  useEffect(() => {
    // ad-server 可达性 → store（Phase 4 R2）：Tauri 壳恒连通；浏览器预览订阅
    // 探针变化，供设置面板显示"未连接后端"离线标识。
    // 只在尚未探测时置 true（Closing L-9）：HMR 重挂载不得把 bootstrap 已写
    // 的 false 翻回 true；bootstrap 成功分支本就会写 true。
    if (isTauriShell()) {
      if (useAppStore.getState().adServerReachable === null) {
        useAppStore.getState().setAdServerReachable(true);
      }
      return;
    }
    return onAdServerReachabilityChange((_baseUrl, reachable) => {
      useAppStore.getState().setAdServerReachable(reachable);
    });
  }, []);

  return {
    locale,
    t,
  };
}
