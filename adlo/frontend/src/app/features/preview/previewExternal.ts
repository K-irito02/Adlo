import { toLocalFileUrl } from '@shared/localFilePath';
import { joinPathSegments } from '@utils/workspacePaths';
import { useAppStore } from '@stores/slicedStore';

/**
 * 按 id 严格解析预览所属工作区：给了 id 但找不到就返回 null，不回退到「当前工作区」。
 * （链接打开语义允许回退，兜底/重试入口不允许——那会把另一个工作区的同名相对路径
 * 拼成 file:// 或读错目录。未给 id 的调用方（文件面板 mock）才回退当前工作区。）
 */
export function resolvePreviewOwner(workspaceId?: string): { id: string; root: string } | null {
  const state = useAppStore.getState();
  if (!workspaceId) {
    const current = state.appInfo?.currentWorkspace;
    const root = current?.rootPath ?? current?.path ?? null;
    return current && root ? { id: current.id, root } : null;
  }
  const entry = state.recentWorkspaces?.find((workspace) => workspace.id === workspaceId);
  const root = entry?.rootPath ?? entry?.path ?? state.externalFileRoots?.[workspaceId] ?? null;
  return root ? { id: workspaceId, root } : null;
}

/** 严格解析工作区根（找不到返回 null）。 */
export function resolveWorkspaceRootStrict(workspaceId?: string): string | null {
  return resolvePreviewOwner(workspaceId)?.root ?? null;
}

/**
 * WebView2（Chromium）能原生渲染的扩展名白名单（事项4）。
 * 只对白名单内的文件提供"浏览器打开"兜底：白名单外（zip/exe/字体/odt/旧版
 * doc|ppt 等）Chromium 同样打不开，显示按钮只会误导用户。
 */
const WEBVIEW_RENDERABLE_EXTENSIONS = new Set([
  'html',
  'htm',
  'xhtml',
  'pdf',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'webp',
  'avif',
  'ico',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'flac',
  'mp4',
  'webm',
  'ogv',
  'm4v',
]);

export function isWebViewRenderableFile(filePath: string | undefined): boolean {
  if (!filePath) {
    return false;
  }
  const segments = filePath.split(/[\\/]/);
  const fileName = segments[segments.length - 1] ?? '';
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return false;
  }
  return WEBVIEW_RENDERABLE_EXTENSIONS.has(fileName.slice(dotIndex + 1).toLowerCase());
}

/** 工作区相对路径 → `file://` URL；工作区不可解析时返回 null。 */
export function resolveBrowserFileUrl(
  workspaceId: string | undefined,
  relativePath: string,
): string | null {
  const root = resolveWorkspaceRootStrict(workspaceId);
  if (!root) {
    return null;
  }
  return toLocalFileUrl(joinPathSegments(root, relativePath));
}

/** 在中心浏览器标签或右侧浏览器面板打开本地文件 URL（新建标签）。 */
export function openLocalFileInBrowser(url: string, target: 'center' | 'panel'): void {
  const state = useAppStore.getState();
  state.browserOpenTab(url);
  if (target === 'center') {
    const id = useAppStore.getState().browserActiveTabId;
    if (id) {
      useAppStore.getState().centerShowBrowserTab(id);
    }
    return;
  }
  state.navigateRightTool('browser');
}
