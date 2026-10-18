import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';
import { joinPathSegments } from '@utils/workspacePaths';
import type { WorkspaceTreeNode } from '../../../kernel/types-workspace-files';

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

/** 本地绝对路径转 `file://` URL（外部打开兜底用：只传良构 URL，不传裸 Windows 路径）。 */
function toFileUrl(absPath: string): string {
  const forward = toForwardSlashes(absPath);
  // 盘符路径补前导 `/` 得 `file:///C:/…`；UNC `//server/share` 即为合法 `file://` host 形。
  const withSlash = /^[a-zA-Z]:\//.test(forward) ? `/${forward}` : forward;
  return `file://${withSlash}`;
}

/** 取路径的父目录（去掉最后一个分隔符之后的部分）；无分隔符时返回 ''。 */
function parentDirectory(currentRelPath: string): string {
  const lastSeparator = Math.max(currentRelPath.lastIndexOf('/'), currentRelPath.lastIndexOf('\\'));
  return lastSeparator >= 0 ? currentRelPath.slice(0, lastSeparator) : '';
}

/** 按「网址链接」设置打开一个 URL。中间区/右面板均为新建标签，绕过就地/新建双态开关。 */
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

export interface LinkWorkspaceTarget {
  id: string;
  root: string;
}

/**
 * 链接归属工作区：优先用文件/预览自身的工作区（跨工作区预览时与当前工作区
 * 可能不同，见事项 6：必须按文件所属工作区解析相对路径），找不到时回退
 * 当前工作区；都没有则返回 null（调用方回退外部打开）。
 */
export function resolveLinkWorkspace(workspaceId?: string): LinkWorkspaceTarget | null {
  const state = useAppStore.getState();
  if (workspaceId) {
    const owned = state.recentWorkspaces?.find((w) => w.id === workspaceId);
    const ownedRoot = owned?.rootPath ?? owned?.path;
    if (owned && ownedRoot) {
      return { id: owned.id, root: ownedRoot };
    }
  }
  const current = state.appInfo?.currentWorkspace;
  const root = current?.rootPath ?? current?.path;
  if (!current || !root) {
    return null;
  }
  return { id: current.id, root };
}

/** 按「文件」设置打开一个本地绝对路径。 */
export function openFileByMethod(absPath: string, workspaceId?: string): void {
  const state = useAppStore.getState();
  const method = state.appInfo?.config?.fileOpenMethod ?? 'panel';
  if (method === 'external') {
    openExternal(toFileUrl(absPath));
    return;
  }
  const target = resolveLinkWorkspace(workspaceId);
  if (!target) {
    openExternal(toFileUrl(absPath));
    return;
  }
  const rel = workspaceRelative(target.root, absPath);
  if (!rel) {
    openExternal(toFileUrl(absPath));
    return;
  }
  void state.openFileForWorkspace(target.id, target.root, rel);
}

/**
 * 链接跳转在文件树中定位：强制展开祖先链（覆盖本次链路上的手动折叠，
 * 不改通用自动展开的 blocked 语义）并选中节点，与用鼠标在树中点开一致。
 */
export function revealInFileTree(
  workspaceId: string,
  relPath: string,
  kind: 'file' | 'directory',
): void {
  const state = useAppStore.getState();
  const norm = relPath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!norm) {
    return;
  }
  const segments = norm.split('/').filter(Boolean);
  for (let index = 1; index < segments.length; index += 1) {
    state.setFileTreePathExpanded(workspaceId, segments.slice(0, index).join('/'), true);
  }
  state.setFileTreeClickedNode(workspaceId, norm, kind);
  // 滚动跟随由文件导航器消费（useFileTreeRevealOnRequest），此处只负责发出请求。
  state.requestFileTreeReveal(workspaceId, norm);
}

/**
 * 在工作区文件树中定位已知目录：树中有该目录节点时展开并选中，返回 true；
 * 树未加载或路径未知时返回 false（调用方走读文件链，缺失则友好报错）。
 */
export function revealWorkspaceDirectory(workspaceId: string, relPath: string): boolean {
  const state = useAppStore.getState();
  const roots = state.workspaceTrees?.[workspaceId];
  if (!roots || roots.length === 0) {
    return false;
  }
  const norm = relPath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!norm) {
    return false;
  }
  const segments = norm.split('/');
  let nodes: WorkspaceTreeNode[] = roots;
  let node: WorkspaceTreeNode | undefined;
  for (const segment of segments) {
    node = nodes.find((candidate) => candidate.name.toLowerCase() === segment.toLowerCase());
    if (!node || node.kind !== 'directory') {
      return false;
    }
    nodes = node.children ?? [];
  }
  if (!node) {
    return false;
  }
  revealInFileTree(workspaceId, norm, 'directory');
  return true;
}

/**
 * Markdown 正文文件链接统一入口：解析为工作区内绝对路径后，
 * 若目标是文件树中的已知目录则在文件树定位展开，否则按「文件」设置打开。
 */
export function openMarkdownFileLink(
  workspaceId: string | undefined,
  currentRelPath: string | undefined,
  href: string,
): void {
  const target = resolveLinkWorkspace(workspaceId);
  if (!target || !currentRelPath) {
    return;
  }
  const abs = resolveMarkdownFileLink(target.root, currentRelPath, href);
  if (!abs) {
    return;
  }
  const rel = workspaceRelative(target.root, abs);
  if (!rel) {
    openFileByMethod(abs, workspaceId);
    return;
  }
  if (revealWorkspaceDirectory(target.id, rel)) {
    return;
  }
  // 目录形链接（尾部分隔符，如 `docs/`）只做文件树定位，不按文件去读
  // （事项 6 审查 P-F3：树未加载时也按目录揭示，不误标 kind:'file'）。
  const hashless = href.split('#', 1)[0].trim();
  if (/[\\/]$/.test(hashless)) {
    revealInFileTree(target.id, rel, 'directory');
    return;
  }
  revealInFileTree(target.id, rel, 'file');
  openFileByMethod(abs, workspaceId);
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
  // 文件链接里的 `#...` 是行内锚点/章节定位，不属于文件路径本身：
  // 先剥掉再解析，否则会被当成文件名的一部分去读文件（事项6 根因B）。
  const hashIndex = href.indexOf('#');
  const raw = (hashIndex >= 0 ? href.slice(0, hashIndex) : href).trim();
  if (!raw) {
    return null;
  }
  // `?query` 同理不是文件名（如 `file.md?raw=true`），与 #fragment 同处理。
  const queryIndex = raw.indexOf('?');
  const noQuery = (queryIndex >= 0 ? raw.slice(0, queryIndex) : raw).trim();
  if (!noQuery) {
    return null;
  }
  // markdown-it 会把空格/CJK 等 percent-encode；解析前解码（失败回退原文，
  // 与 MarkdownPreview 锚点解码同模式）。
  let decoded = noQuery;
  try {
    decoded = decodeURIComponent(noQuery);
  } catch {
    decoded = noQuery;
  }
  // UNC（`\\server\share`）是网络路径：禁止重写进工作区（事项 6 审查 P-F12）。
  if (/^(\\\\|\/\/)/.test(decoded)) {
    return null;
  }

  if (/^file:\/\//i.test(decoded)) {
    const fromUrl = fromFileUrl(decoded);
    const normalized = fromUrl ? normalizeAbsolutePath(fromUrl) : null;
    if (!normalized || !isWithinRoot(workspaceRoot, normalized)) {
      return null;
    }
    return toWindowsPath(normalized);
  }

  if (/^[a-zA-Z]:[\\/]/.test(decoded)) {
    const normalized = normalizeAbsolutePath(decoded);
    if (!normalized || !isWithinRoot(workspaceRoot, normalized)) {
      return null;
    }
    return toWindowsPath(normalized);
  }

  const isRootRelative = decoded.startsWith('/') || decoded.startsWith('\\');
  const baseDir = isRootRelative ? '' : parentDirectory(currentRelPath);
  const joined = baseDir ? `${baseDir}/${decoded.replace(/^[\\/]+/, '')}` : decoded;
  const resolved = resolveRelativeSegments(joined);
  if (!resolved) {
    return null;
  }
  return toWindowsPath(joinPathSegments(workspaceRoot, resolved));
}
