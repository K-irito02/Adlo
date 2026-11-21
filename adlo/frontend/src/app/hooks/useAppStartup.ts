import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { AppInfo } from '@adlo/kernel';
import type { CopyDict, Locale } from '../i18n/types';
import { loadLocale } from '../i18n/i18nLoader';
import { resolveAppLanguage } from '../i18n/resolveLanguage';
import { useAppActions } from './useAppActions';
import { useThemeSync } from './useThemeSync';
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '../../tauri-bridge';
import { onAdServerReachabilityChange } from '../../preview-bridge/preview-reachability';
import { sameWorkspacePath } from '../../shared/workspacePathMatch';
import { initSiteMetaCache, subscribeSiteMetaReady } from '@utils/siteMetaCache';
import { pageMetaClient } from '@utils/pageMetaClient';
import { collectWarmupUrls } from '@utils/warmupUrls';
import { syncBookmarkIconSnapshots } from '@features/bookmarks/bookmarkIconSnapshots';

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
    // 书签自带图标（导入文件的 ICON）在水合完成后播种进共享镜像：
    // 水合前播种会挡住持久层里的真实图标，故挂在 ready 回调上。
    const unsubReady = subscribeSiteMetaReady(() => {
      syncBookmarkIconSnapshots();
    });
    // 单次收集：store 构造期已同步水合（hydrateAll），首次收集即见全量持久化数据，
    // 无需等待延迟水合（requestIdleCallback/setTimeout 机制已由 T7/T9 删除）。
    const urls = collectWarmupUrls();
    if (urls.length > 0) {
      void pageMetaClient.warmup(urls);
    }
    return unsubReady;
  }, []);

  useEffect(() => {
    return window.digitalLife.workspace.onFileChanged((event) => {
      actions.markExternalFileChange(event);
    });
  }, [actions, actions.markExternalFileChange]);

  useEffect(() => {
    return actions.subscribeWorkspaceFilesChanged();
  }, [actions]);

  // 监听根声明（浏览器预览轮询用；桌面代价为一次 no-op 调用）：
  // 覆盖侧栏全部「已添加」工作区（与服务端 `watch_roots_with_db` 同口径：只排除
  // removedFromSidebar），并补当前工作区兜底；新增/移除后即时重算。
  const recentWorkspaces = useAppStore(useShallow((state) => state.recentWorkspaces));
  const appReady = useAppStore((state) => state.appReady);
  const currentWorkspacePath = appInfo?.currentWorkspace?.path;
  // 工作区集合签名：新增/移除/可用性变化时重跑全量快照补刷；排序/置顶不触发。
  const workspaceRefreshSignature = (recentWorkspaces ?? [])
    .filter((entry) => !entry.removedFromSidebar && entry.available)
    .map((entry) => entry.id)
    .join('|');
  useEffect(() => {
    // 启动就绪 / 新增工作区时，为所有已添加可用工作区加载 Git 快照（与展开状态无关）。
    // 5s 新鲜期在 refreshAllGitSnapshotsSilent 内去重，bootstrap 已取的当前工作区不会重复。
    if (!appReady || workspaceRefreshSignature === '') {
      return;
    }
    void actions.refreshAllGitSnapshotsSilent();
  }, [appReady, workspaceRefreshSignature, actions, actions.refreshAllGitSnapshotsSilent]);
  useEffect(() => {
    const roots = (recentWorkspaces ?? [])
      .filter((entry) => !entry.removedFromSidebar)
      .map((entry) => entry.path)
      .filter((path) => Boolean(path));
    if (
      currentWorkspacePath &&
      !roots.some((path) => sameWorkspacePath(path, currentWorkspacePath))
    ) {
      roots.push(currentWorkspacePath);
    }
    window.digitalLife.workspace.setFilesChangedRoots(roots);
  }, [recentWorkspaces, currentWorkspacePath]);

  useEffect(() => {
    // 焦点回归补刷（VSCode 对齐 `refresh on window focus`）：
    // 兜底 watcher 漏事件 / 断线 / 浏览器轮询间隙（后端已按侧栏全部工作区监听）。
    // 树与 git 快照都按"可见已展开"范围静默补刷（与手动刷新按钮同范围），
    // 无图标闪烁、无写循环。去抖 1s：切窗口抖动与 HMR 重挂载不连刷。
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshOnFocus = () => {
      if (timer !== undefined) {
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        if (document.visibilityState !== 'visible') {
          return;
        }
        void actions.refreshAllWorkspaceTrees();
        void actions.refreshAllGitSnapshotsSilent();
        void actions.reconcileSelectedFile();
      }, 1000);
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [
    actions,
    actions.refreshAllWorkspaceTrees,
    actions.refreshAllGitSnapshotsSilent,
    actions.reconcileSelectedFile,
  ]);

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
