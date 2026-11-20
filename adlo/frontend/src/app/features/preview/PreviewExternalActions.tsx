import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';
import {
  isBrowserTabViewableFile,
  openLocalFileInBrowser,
  resolveBrowserFileUrl,
} from './previewExternal';

export interface PreviewExternalActionsProps {
  /** 工作区相对路径 */
  filePath: string;
  workspaceId: string | undefined;
}

/**
 * 「中间打开 / 右侧打开」：只在**浏览器标签能看、内部渲染器看不了**时出现
 * （目前只有 HTML 系列），且必须文件确实存在（not-found 不显示——文件都没了，
 * 浏览器同样打不开）。
 *
 * 媒体/图片不再走这条入口：事项 7 的 Range 流式预览已覆盖任意体积，而内置浏览器
 * 与内部预览是同一个 Chromium 解码器，解不了的编码换标签也解不了；早期版本把大媒体
 * 塞进子 WebView 还会把宿主窗口拖到无响应（打包态实测）。
 *
 * 可见文字保持简短，完整说明放在 `title` 与无障碍名称里。
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
    return isBrowserTabViewableFile(filePath) ? resolveBrowserFileUrl(workspaceId, filePath) : null;
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
        title={t.previewOpenInBrowserTabHint as string}
        aria-label={t.previewOpenInBrowserTabHint as string}
        onClick={() => openLocalFileInBrowser(url, 'center')}
      >
        {t.previewOpenInBrowserTab as string}
      </button>
      <button
        type="button"
        className="adl-unsupported-preview__action"
        title={t.previewOpenInBrowserPanelHint as string}
        aria-label={t.previewOpenInBrowserPanelHint as string}
        onClick={() => openLocalFileInBrowser(url, 'panel')}
      >
        {t.previewOpenInBrowserPanel as string}
      </button>
    </div>
  );
}
