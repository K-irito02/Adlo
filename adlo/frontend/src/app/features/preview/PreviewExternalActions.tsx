import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';
import {
  isWebViewRenderableFile,
  openLocalFileInBrowser,
  resolveBrowserFileUrl,
} from './previewExternal';

export interface PreviewExternalActionsProps {
  /** 工作区相对路径 */
  filePath: string;
  workspaceId: string | undefined;
}

/**
 * 「在中心浏览器标签打开 / 在右侧浏览器面板打开」（事项4）：
 * 仅在内部渲染器不支持的占位态出现，且扩展名必须在 WebView2 原生可渲染白名单内。
 */
export function PreviewExternalActions({ filePath, workspaceId }: PreviewExternalActionsProps) {
  const { t } = useTCopy();
  // 订阅工作区数据：启动恢复期工作区列表可能晚于文件预览到达，必须在其后重算 URL。
  const recentWorkspaces = useAppStore(useShallow((s) => s.recentWorkspaces));
  const appInfo = useAppStore(useShallow((s) => s.appInfo));
  const externalFileRoots = useAppStore(useShallow((s) => s.externalFileRoots));
  const url = useMemo(() => {
    // 这些订阅值只用于在工作区数据到达/变更时重算 URL（正文读取走 getState 快照）。
    void recentWorkspaces;
    void appInfo;
    void externalFileRoots;
    return isWebViewRenderableFile(filePath) ? resolveBrowserFileUrl(workspaceId, filePath) : null;
    // recentWorkspaces/appInfo/externalFileRoots 变化时重算（selector 值参与依赖）。
  }, [filePath, workspaceId, recentWorkspaces, appInfo, externalFileRoots]);
  // 浏览器模式（非 Tauri）的浏览器面板是 iframe，WebView 会拦截 file:// 子框架；
  // 该兜底入口只在桌面 WebView2 中有效，避免双端给出一个多半无法加载的按钮。
  if (!url || !isTauriShell()) {
    return null;
  }
  return (
    <div className="adl-preview-external">
      <button
        type="button"
        className="adl-unsupported-preview__action"
        onClick={() => openLocalFileInBrowser(url, 'center')}
      >
        {t.previewOpenInBrowserTab as string}
      </button>
      <button
        type="button"
        className="adl-unsupported-preview__action"
        onClick={() => openLocalFileInBrowser(url, 'panel')}
      >
        {t.previewOpenInBrowserPanel as string}
      </button>
    </div>
  );
}
