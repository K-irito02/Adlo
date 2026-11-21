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
 * 「浏览器标签能看、内部渲染器看不了」的扩展名（事项 7 收窄）。
 *
 * 只保留**文档类**：HTML 系列内部没有渲染器，浏览器标签是唯一能看到渲染结果的方式。
 * 图片/音视频已被事项 7 的 Range 流式预览覆盖（任意体积、可拖动进度），
 * 且浏览器与内部用的是同一个 Chromium 解码器——内部解不了的编码（mkv/avi 等）
 * 浏览器同样解不了，给按钮只会误导，还会把大媒体塞进子 WebView（打包态实测会把
 * 宿主窗口拖到无响应）。PDF/Office 由内置渲染器负责，也不需要该入口。
 */
const BROWSER_TAB_VIEWABLE_EXTENSIONS = new Set(['html', 'htm', 'xhtml']);

export function isBrowserTabViewableFile(filePath: string | undefined): boolean {
  if (!filePath) {
    return false;
  }
  const segments = filePath.split(/[\\/]/);
  const fileName = segments[segments.length - 1] ?? '';
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return false;
  }
  return BROWSER_TAB_VIEWABLE_EXTENSIONS.has(fileName.slice(dotIndex + 1).toLowerCase());
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
