import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';
import { joinPathSegments } from '@utils/workspacePaths';

function openExternal(url: string): void {
  if (isTauriShell()) {
    void window.digitalLife?.window?.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function toForwardSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function toWindowsPath(value: string): string {
  return value.replace(/\//g, '\\');
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isWithinRoot(root: string, absPath: string): boolean {
  const normalizedRoot = stripTrailingSlash(toForwardSlashes(root)).toLowerCase();
  const normalizedAbs = toForwardSlashes(absPath).toLowerCase();
  return normalizedAbs === normalizedRoot || normalizedAbs.startsWith(`${normalizedRoot}/`);
}

/** 绝对路径相对工作区根的路径（正斜杠）；不在工作区内时返回 null。 */
function workspaceRelative(root: string, absPath: string): string | null {
  if (!isWithinRoot(root, absPath)) {
    return null;
  }
  const normalizedRoot = stripTrailingSlash(toForwardSlashes(root));
  return toForwardSlashes(absPath).slice(normalizedRoot.length).replace(/^\/+/, '');
}

/** 归一化相对片段：消除 `.` 与 `..`；上溢出工作区根时返回 null。 */
function resolveRelativeSegments(relativePath: string): string | null {
  const resolved: string[] = [];
  for (const segment of toForwardSlashes(relativePath).split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (resolved.length === 0) {
        return null;
      }
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join('/');
}

function fromFileUrl(raw: string): string | null {
  try {
    const path = decodeURIComponent(new URL(raw).pathname.replace(/^\//, ''));
    return /^[a-zA-Z]:[\\/]/.test(path) ? path : null;
  } catch {
    return null;
  }
}

/** 归一化盘符绝对路径：消除 `.`/`..`；上溢出盘符根时返回 null。 */
function normalizeAbsolutePath(absPath: string): string | null {
  const match = /^([a-zA-Z]:)(\/.*)?$/.exec(toForwardSlashes(absPath));
  if (!match) {
    return null;
  }
  const resolved: string[] = [];
  for (const segment of (match[2] ?? '').split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (resolved.length === 0) {
        return null;
      }
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return `${match[1]}/${resolved.join('/')}`;
}

/** 取路径的父目录（去掉最后一个分隔符之后的部分）；无分隔符时返回 ''。 */
function parentDirectory(currentRelPath: string): string {
  const lastSeparator = Math.max(currentRelPath.lastIndexOf('/'), currentRelPath.lastIndexOf('\\'));
  return lastSeparator >= 0 ? currentRelPath.slice(0, lastSeparator) : '';
}

/** 按「网址链接打开方式」设置打开一个 URL。中间区/右面板均为新建标签，绕过就地/新建双态开关。 */
export function openUrlByMethod(url: string): void {
  const state = useAppStore.getState();
  const method = state.appInfo?.config?.linkOpenMethod ?? 'panel';
  if (method === 'external') {
    openExternal(url);
    return;
  }
  state.browserOpenTab(url);
  if (method === 'middle') {
    const id = useAppStore.getState().browserActiveTabId;
    if (id) {
      useAppStore.getState().centerShowBrowserTab(id);
    }
  }
}

/** 按「文件打开方式」设置打开一个本地绝对路径。 */
export function openFileByMethod(absPath: string): void {
  const state = useAppStore.getState();
  const method = state.appInfo?.config?.fileOpenMethod ?? 'panel';
  if (method === 'external') {
    openExternal(absPath);
    return;
  }
  const ws = state.appInfo?.currentWorkspace;
  const root = ws?.rootPath ?? ws?.path;
  if (!ws || !root) {
    openExternal(absPath);
    return;
  }
  const rel = workspaceRelative(root, absPath);
  if (!rel) {
    openExternal(absPath);
    return;
  }
  void state.openFileForWorkspace(ws.id, root, rel);
}

/**
 * 将 Markdown 正文中的文件链接解析为工作区内的绝对路径。
 * 相对链接基于当前 md 文件所在目录解析，`..` 上溢出或指向工作区外时返回 null（由调用方回退外部打开）。
 */
export function resolveMarkdownFileLink(
  workspaceRoot: string,
  currentRelPath: string,
  href: string,
): string | null {
  const raw = href.trim();
  if (!raw) {
    return null;
  }

  if (/^file:\/\//i.test(raw)) {
    const fromUrl = fromFileUrl(raw);
    const normalized = fromUrl ? normalizeAbsolutePath(fromUrl) : null;
    if (!normalized || !isWithinRoot(workspaceRoot, normalized)) {
      return null;
    }
    return toWindowsPath(normalized);
  }

  if (/^[a-zA-Z]:[\\/]/.test(raw)) {
    const normalized = normalizeAbsolutePath(raw);
    if (!normalized || !isWithinRoot(workspaceRoot, normalized)) {
      return null;
    }
    return toWindowsPath(normalized);
  }

  const isRootRelative = raw.startsWith('/') || raw.startsWith('\\');
  const baseDir = isRootRelative ? '' : parentDirectory(currentRelPath);
  const joined = baseDir ? `${baseDir}/${raw.replace(/^[\\/]+/, '')}` : raw;
  const resolved = resolveRelativeSegments(joined);
  if (!resolved) {
    return null;
  }
  return toWindowsPath(joinPathSegments(workspaceRoot, resolved));
}
