import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildOutlineFromContent } from '../../src/shared/outline';
import { captureGitSnapshot } from './git';

export const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
export const DEFAULT_MAX_TEXT_FILE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_MEDIA_BYTES = 50 * 1024 * 1024;

/**
 * 携带 IPC 错误码的服务错误（收尾 F-05）：dev-server 顶层 catch 透传其 code，
 * 使浏览器预览与 Rust（INVALID_INPUT 等）错误码对齐，前端错误视图双端一致。
 */
export class PreviewServiceError extends Error {
  readonly code: string;

  constructor(message: string, code = 'INVALID_INPUT') {
    super(message);
    this.name = 'PreviewServiceError';
    this.code = code;
  }
}
export const MAX_TREE_DEPTH = 64;
export const MAX_TREE_NODES = 200_000;
export const MAX_COLLECTED_FILES = 50_000;
export const IGNORED_DIRS = new Set([
  '.git',
  'target',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
]);
export const ROOT_MARKERS = [
  '.git',
  'Cargo.toml',
  'package.json',
  'pyproject.toml',
  'go.mod',
  'pom.xml',
];
const CACHE_TTL_MS = 10_000;

interface RetrievalCacheEntry {
  snapshot: import('../src/kernel/index').RetrievalSnapshot;
  capturedAt: number;
}

const retrievalCache = new Map<string, RetrievalCacheEntry>();

export function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

export function nowMs(): number {
  return Date.now();
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function relativePath(rootPath: string, targetPath: string): string {
  return normalizePath(path.relative(rootPath, targetPath));
}

export function resolveWorkspacePath(rootPath: string, relativeTarget: string): string {
  const resolved = path.resolve(rootPath, relativeTarget);
  const normalizedRoot = `${path.resolve(rootPath)}${path.sep}`;
  const normalizedResolved = path.resolve(resolved);
  if (
    normalizedResolved !== path.resolve(rootPath) &&
    !normalizedResolved.startsWith(normalizedRoot)
  ) {
    throw new Error(`path escapes workspace: ${relativeTarget}`);
  }
  return normalizedResolved;
}

export async function detectWorkspaceRoot(inputPath: string): Promise<string> {
  const resolved = await fs.realpath(path.resolve(inputPath));
  const stats = await fs.stat(resolved);
  let current = stats.isFile() ? path.dirname(resolved) : resolved;
  for (;;) {
    for (const marker of ROOT_MARKERS) {
      if (await pathExists(path.join(current, marker))) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return resolved;
    }
    current = parent;
  }
}

export async function inferWorkspaceType(
  rootPath: string,
): Promise<import('../src/kernel/index').WorkspaceType> {
  const markers: Array<[string, import('../src/kernel/index').WorkspaceType]> = [
    ['Cargo.toml', 'rust'],
    ['package.json', 'node'],
    ['pyproject.toml', 'python'],
    ['requirements.txt', 'python'],
    ['go.mod', 'go'],
    ['pom.xml', 'java'],
    ['build.gradle', 'java'],
  ];
  for (const [marker, workspaceType] of markers) {
    if (
      ROOT_MARKERS.includes(marker) ||
      marker === 'requirements.txt' ||
      marker === 'build.gradle'
    ) {
      if (await pathExists(path.join(rootPath, marker))) {
        return workspaceType;
      }
    }
  }
  return 'unknown';
}

export function createWorkspaceId(rootPath: string): string {
  const normalized = normalizePath(rootPath).toLowerCase();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0;
  }
  return `workspace_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export async function listTree(
  rootPath: string,
): Promise<import('../src/kernel/index').WorkspaceTreeNode[]> {
  let remaining = MAX_TREE_NODES;
  return listTreeInner(
    rootPath,
    rootPath,
    0,
    () => remaining,
    (next) => {
      remaining = next;
    },
  );
}

async function listTreeInner(
  rootPath: string,
  currentPath: string,
  depth: number,
  getRemaining: () => number,
  setRemaining: (value: number) => void,
): Promise<import('../src/kernel/index').WorkspaceTreeNode[]> {
  if (getRemaining() === 0 || depth > MAX_TREE_DEPTH) return [];
  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: import('../src/kernel/index').WorkspaceTreeNode[] = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    if (getRemaining() === 0) break;
    const entryPath = path.join(currentPath, entry.name);
    const nodePath = relativePath(rootPath, entryPath);
    setRemaining(getRemaining() - 1);
    if (entry.isDirectory()) {
      nodes.push({
        path: nodePath,
        name: entry.name,
        kind: 'directory',
        children: await listTreeInner(rootPath, entryPath, depth + 1, getRemaining, setRemaining),
      });
      continue;
    }
    if (entry.isFile()) {
      nodes.push({ path: nodePath, name: entry.name, kind: 'file', children: [] });
    }
  }
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
  return nodes;
}

export async function readFile(
  rootPath: string,
  relativeTarget: string,
): Promise<import('../src/kernel/index').WorkspaceFileDocument> {
  const absolutePath = resolveWorkspacePath(rootPath, relativeTarget);
  const stats = await fs.stat(absolutePath);
  // 与 Rust read_file 对齐：开文件文本上限 8MB（树扫描/检索另走 1MB 常量）；
  // 超 1MB 内容由前端重型门先提示、确认后才渲染。
  if (!stats.isFile()) {
    throw new PreviewServiceError(`not a file: ${relativeTarget}`);
  }
  if (stats.size > DEFAULT_MAX_TEXT_FILE_BYTES) {
    throw new PreviewServiceError(`file too large: ${relativeTarget}`);
  }
  const buffer = await fs.readFile(absolutePath);
  // 与 Rust looks_binary 对齐：二进制走文本通道时拒绝，避免双端行为分叉
  //（桌面端报 InvalidInput 友好错误，浏览器端此前直接 mojibake）。
  if (buffer.subarray(0, 4096).includes(0)) {
    throw new PreviewServiceError(`binary files are not readable as context: ${relativeTarget}`);
  }
  const content = buffer.toString('utf8');
  return {
    path: normalizePath(relativeTarget),
    content,
    lastModifiedAt: stats.mtimeMs,
  };
}

export async function readMediaFile(
  rootPath: string,
  relativeTarget: string,
): Promise<import('../src/kernel/index').WorkspaceMediaDocument> {
  const absolutePath = resolveWorkspacePath(rootPath, relativeTarget);
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) {
    throw new PreviewServiceError(`not a file: ${relativeTarget}`);
  }
  if (stats.size > DEFAULT_MAX_MEDIA_BYTES) {
    throw new PreviewServiceError(
      `file exceeds media read limit (${DEFAULT_MAX_MEDIA_BYTES} bytes): ${relativeTarget}`,
    );
  }
  const bytes = await fs.readFile(absolutePath);
  if (bytes.length > DEFAULT_MAX_MEDIA_BYTES) {
    throw new PreviewServiceError(
      `file exceeds media read limit (${DEFAULT_MAX_MEDIA_BYTES} bytes): ${relativeTarget}`,
    );
  }
  return {
    path: normalizePath(relativeTarget),
    mime: guessMediaMime(relativeTarget),
    base64: bytes.toString('base64'),
    size: bytes.length,
    lastModifiedAt: stats.mtimeMs,
  };
}

export function guessMediaMime(relativeTarget: string): string {
  // 与 Rust guess_media_mime 对齐：先归一化反斜杠再取扩展名。
  const fileName = relativeTarget.replace(/\\/g, '/').split('/').pop() ?? relativeTarget;
  const dot = fileName.lastIndexOf('.');
  const ext = (dot > 0 ? fileName.slice(dot + 1) : '').toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'ico':
      return 'image/x-icon';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'apng':
      return 'image/apng';
    case 'svg':
      return 'image/svg+xml';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
    case 'oga':
      return 'audio/ogg';
    case 'm4a':
      return 'audio/mp4';
    case 'flac':
      return 'audio/flac';
    case 'aac':
      return 'audio/aac';
    case 'opus':
      return 'audio/opus';
    case 'weba':
      return 'audio/webm';
    case 'wma':
      return 'audio/x-ms-wma';
    case 'aiff':
    case 'aif':
      return 'audio/aiff';
    case 'mid':
    case 'midi':
      return 'audio/midi';
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case 'ogv':
      return 'video/ogg';
    case 'wmv':
      return 'video/x-ms-wmv';
    case 'flv':
    case 'f4v':
      return 'video/x-flv';
    case 'mpg':
    case 'mpeg':
      return 'video/mpeg';
    case '3gp':
      return 'video/3gpp';
    case '3g2':
      return 'video/3gpp2';
    case 'pdf':
      return 'application/pdf';
    case 'csv':
      return 'text/csv';
    case 'docx':
    case 'docm':
    case 'dotx':
    case 'dotm':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc':
    case 'dot':
      return 'application/msword';
    case 'xlsx':
    case 'xlsm':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls':
    case 'xlsb':
      return 'application/vnd.ms-excel';
    case 'ods':
      return 'application/vnd.oasis.opendocument.spreadsheet';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'ppsx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.slideshow';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'odp':
      return 'application/vnd.oasis.opendocument.presentation';
    default:
      return 'application/octet-stream';
  }
}

export async function createFile(
  rootPath: string,
  relativeTarget: string,
  content = '',
): Promise<import('../src/kernel/index').WorkspaceFileDocument> {
  const absolutePath = resolveWorkspacePath(rootPath, relativeTarget);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch {
    stats = undefined;
  }
  if (stats?.isDirectory()) throw new Error(`directory already exists: ${relativeTarget}`);
  if (stats?.isFile()) throw new Error(`file already exists: ${relativeTarget}`);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf8');
  return readFile(rootPath, relativeTarget);
}

export async function updateFileContent(
  rootPath: string,
  relativeTarget: string,
  content: string,
): Promise<import('../src/kernel/index').WorkspaceFileDocument> {
  const absolutePath = resolveWorkspacePath(rootPath, relativeTarget);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch {
    stats = undefined;
  }
  if (!stats?.isFile()) throw new Error(`file not found: ${relativeTarget}`);
  if (Buffer.byteLength(content, 'utf8') > DEFAULT_MAX_TEXT_FILE_BYTES) {
    throw new Error(`file exceeds configured write limit: ${relativeTarget}`);
  }
  await fs.writeFile(absolutePath, content, 'utf8');
  return readFile(rootPath, relativeTarget);
}

export async function createFolder(rootPath: string, relativeTarget: string): Promise<boolean> {
  const absolutePath = resolveWorkspacePath(rootPath, relativeTarget);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch {
    stats = undefined;
  }
  if (stats?.isFile()) throw new Error(`file already exists at: ${relativeTarget}`);
  if (stats?.isDirectory()) throw new Error(`directory already exists: ${relativeTarget}`);
  await fs.mkdir(absolutePath, { recursive: true });
  return true;
}

export async function renameFile(
  rootPath: string,
  relativePath: string,
  newName: string,
): Promise<boolean> {
  const src = resolveWorkspacePath(rootPath, relativePath);
  if (!fsSync.existsSync(src)) throw new Error(`path not found: ${relativePath}`);
  const parent = path.dirname(src);
  const dst = path.join(parent, newName);
  if (fsSync.existsSync(dst)) throw new Error(`target already exists: ${newName}`);
  await fs.rename(src, dst);
  return true;
}

export async function deleteFileEntry(rootPath: string, relativePath: string): Promise<boolean> {
  const target = resolveWorkspacePath(rootPath, relativePath);
  if (!fsSync.existsSync(target)) throw new Error(`path not found: ${relativePath}`);
  if (process.platform === 'win32') {
    const psPath = target.replace(/'/g, "''");
    const isDir = fsSync.statSync(target).isDirectory();
    const method = isDir ? 'DeleteDirectory' : 'DeleteFile';
    const args = isDir
      ? `'${psPath}','OnlyErrorDialogs','SendToRecycleBin'`
      : `'${psPath}','OnlyErrorDialogs','SendToRecycleBin'`;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${method}(${args})`,
        ],
        { windowsHide: true },
      );
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`PowerShell exit code ${code}`));
      });
    });
  } else {
    if (fsSync.statSync(target).isDirectory()) {
      await fs.rm(target, { recursive: true, force: true });
    } else {
      await fs.unlink(target);
    }
  }
  return true;
}

export async function duplicateFile(
  rootPath: string,
  srcRelativePath: string,
  dstRelativePath: string,
): Promise<boolean> {
  const src = resolveWorkspacePath(rootPath, srcRelativePath);
  if (!fsSync.existsSync(src)) throw new Error(`source not found: ${srcRelativePath}`);
  let dst = path.resolve(rootPath, dstRelativePath);
  if (fsSync.existsSync(dst)) {
    const ext = path.extname(dst);
    const dir = path.dirname(dst);
    const base = path.basename(dst, ext);
    let i = 1;
    while (fsSync.existsSync(dst)) {
      dst = path.join(dir, `${base}-copy${i}${ext}`);
      i += 1;
      if (i > 100) throw new Error('too many conflict attempts');
    }
  }
  const dstParent = path.dirname(dst);
  await fs.mkdir(dstParent, { recursive: true });
  if (fsSync.statSync(src).isDirectory()) {
    await fs.cp(src, dst, { recursive: true });
  } else {
    await fs.copyFile(src, dst);
  }
  return true;
}

export async function moveFile(
  rootPath: string,
  relativePath: string,
  newPath: string,
): Promise<boolean> {
  const src = resolveWorkspacePath(rootPath, relativePath);
  if (!fsSync.existsSync(src)) throw new Error(`source not found: ${relativePath}`);
  const dst = resolveWorkspacePath(rootPath, newPath);
  if (fsSync.existsSync(dst)) throw new Error(`target already exists: ${newPath}`);
  const dstParent = path.dirname(dst);
  await fs.mkdir(dstParent, { recursive: true });
  await fs.rename(src, dst);
  return true;
}

export async function getAbsolutePath(rootPath: string, relativeTarget: string): Promise<string> {
  const resolved = resolveWorkspacePath(rootPath, relativeTarget);
  return normalizePath(resolved);
}

export async function outline(
  rootPath: string,
  relativeTarget: string,
): Promise<import('../src/kernel/index').FileOutlineItem[]> {
  // 与 Rust outline() 对齐锁定 1MB（dev readFile 是 8MB，大纲不跟随放宽）。
  const absolutePath = resolveWorkspacePath(rootPath, relativeTarget);
  const stats = await fs.stat(absolutePath);
  if (stats.size > DEFAULT_MAX_FILE_BYTES) {
    throw new PreviewServiceError(`outline too large: ${relativeTarget}`);
  }
  const document = await readFile(rootPath, relativeTarget);
  return buildOutlineFromContent(document.content, normalizePath(relativeTarget));
}

export async function collectTextFiles(
  rootPath: string,
  currentPath: string,
  results: string[],
): Promise<void> {
  // ripgrep-style C（仅检索调用）：不设总大小上限、不预读内容探可读性；
  // 体积/二进制判定下沉到扫描期（NUL 即停）与单行护栏。此处只做目录/链接/数量过滤。
  // 有意与 Rust 不完全一致（P4-R1-R3，dev-preview 限定）：
  // Rust 枚举仍用扩展名 deny-list + 全量 ignored_dirs 预过滤，本函数不过滤扩展名、
  // 忽略目录集更小——二进制靠扫描期 NUL 拦截，结果等价，仅多几次无害 open。
  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (results.length >= MAX_COLLECTED_FILES) return;
    if (IGNORED_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await collectTextFiles(rootPath, entryPath, results);
      continue;
    }
    if (!entry.isFile()) continue;
    results.push(entryPath);
  }
}

interface CollectResult {
  files: string[];
  tree: import('../src/kernel/index').WorkspaceTreeNode[];
}

async function collectFilesAndBuildTree(rootPath: string): Promise<CollectResult> {
  const files: string[] = [];
  const entries: import('../src/kernel/index').WorkspaceTreeNode[] = [];
  let fileRemaining = MAX_COLLECTED_FILES;
  let nodeRemaining = MAX_TREE_NODES;

  await collectInner(
    rootPath,
    rootPath,
    0,
    files,
    entries,
    () => ({ fileRemaining, nodeRemaining }),
    (updates: { fileRemaining?: number; nodeRemaining?: number }) => {
      if (updates.fileRemaining !== undefined) fileRemaining = updates.fileRemaining;
      if (updates.nodeRemaining !== undefined) nodeRemaining = updates.nodeRemaining;
    },
  );

  entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });

  return { files, tree: entries };
}

async function collectInner(
  rootPath: string,
  currentPath: string,
  depth: number,
  files: string[],
  nodes: import('../src/kernel/index').WorkspaceTreeNode[],
  getRemaining: () => { fileRemaining: number; nodeRemaining: number },
  setRemaining: (updates: { fileRemaining?: number; nodeRemaining?: number }) => void,
): Promise<void> {
  if (depth > MAX_TREE_DEPTH) return;
  const { fileRemaining, nodeRemaining } = getRemaining();
  if (fileRemaining === 0 && nodeRemaining === 0) return;

  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
    const entryPath = path.join(currentPath, entry.name);
    const nodePath = relativePath(rootPath, entryPath);

    if (entry.isDirectory()) {
      const { nodeRemaining: nr } = getRemaining();
      if (nr === 0) break;
      setRemaining({ nodeRemaining: nr - 1 });

      const childNodes: import('../src/kernel/index').WorkspaceTreeNode[] = [];
      await collectInner(
        rootPath,
        entryPath,
        depth + 1,
        files,
        childNodes,
        getRemaining,
        setRemaining,
      );
      childNodes.sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      });
      nodes.push({ path: nodePath, name: entry.name, kind: 'directory', children: childNodes });
      continue;
    }

    if (!entry.isFile()) continue;

    const { nodeRemaining: nr, fileRemaining: fr } = getRemaining();
    if (nr === 0) break;
    setRemaining({ nodeRemaining: nr - 1 });

    nodes.push({ path: nodePath, name: entry.name, kind: 'file', children: [] });

    if (fr === 0) continue;
    let stats;
    try {
      stats = await fs.stat(entryPath);
    } catch {
      continue;
    }
    if (stats.size > DEFAULT_MAX_FILE_BYTES) continue;

    try {
      const fd = await fs.open(entryPath, 'r');
      const buffer = Buffer.alloc(4096);
      const { bytesRead } = await fd.read(buffer, 0, 4096, 0);
      await fd.close();
      Buffer.from(buffer.subarray(0, bytesRead)).toString('utf8');
      files.push(entryPath);
      setRemaining({ fileRemaining: fr - 1 });
    } catch {
      // Binary file, skip
    }
  }
}

export async function buildRetrievalSnapshot(
  workspaceId: string,
  rootPath: string,
): Promise<import('../src/kernel/index').RetrievalSnapshot> {
  const now = nowMs();
  const cached = retrievalCache.get(workspaceId);
  if (cached && now - cached.capturedAt < CACHE_TTL_MS) {
    return cached.snapshot;
  }
  const snapshot = await buildRetrievalSnapshotInner(workspaceId, rootPath);
  retrievalCache.set(workspaceId, { snapshot, capturedAt: now });
  return snapshot;
}

async function buildRetrievalSnapshotInner(
  workspaceId: string,
  rootPath: string,
): Promise<import('../src/kernel/index').RetrievalSnapshot> {
  const { files, tree } = await collectFilesAndBuildTree(rootPath);

  const extensionCounts = new Map<string, number>();
  for (const filePath of files) {
    const extension = path.extname(filePath) || '[none]';
    extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
  }
  const topExtensions: import('../src/kernel/index').RetrievalFileTypeCount[] = Array.from(
    extensionCounts.entries(),
  )
    .map(([extension, count]) => ({ extension, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 12);

  const flattenTree = (
    nodes: import('../src/kernel/index').WorkspaceTreeNode[],
    repoMap: import('../src/kernel/index').RepoMapEntry[],
  ) => {
    for (const node of nodes) {
      repoMap.push({ path: node.path, type: node.kind });
      if (node.children.length > 0) {
        flattenTree(node.children, repoMap);
      }
    }
  };
  const repoMap: import('../src/kernel/index').RepoMapEntry[] = [];
  flattenTree(tree, repoMap);

  return {
    workspaceId,
    rootPath,
    status: 'completed',
    scannedFiles: files.length,
    indexedTextFiles: files.length,
    startedAt: nowMs(),
    updatedAt: nowMs(),
    completedAt: nowMs(),
    lastError: undefined,
    topExtensions,
    repoMap,
  };
}

export async function openWorkspace(workspacePath: string): Promise<{
  meta: import('../src/kernel/index').WorkspaceMeta;
  recent: import('../src/kernel/index').RecentWorkspaceEntry;
  retrieval: import('../src/kernel/index').RetrievalSnapshot;
}> {
  if (!fsSync.existsSync(workspacePath)) {
    fsSync.mkdirSync(workspacePath, { recursive: true });
  }
  const rootPath = await detectWorkspaceRoot(workspacePath);
  const name = path.basename(rootPath) || rootPath;
  const id = createWorkspaceId(rootPath);
  const currentTime = nowMs();
  const gitSnapshot = await captureGitSnapshot(rootPath);
  const meta: import('../src/kernel/index').WorkspaceMeta = {
    id,
    path: rootPath,
    rootPath,
    name,
    type: await inferWorkspaceType(rootPath),
    status: 'ready',
    gitSnapshot,
    createdAt: currentTime,
    updatedAt: currentTime,
    lastOpenedAt: currentTime,
  };
  const recent: import('../src/kernel/index').RecentWorkspaceEntry = {
    id,
    path: rootPath,
    rootPath,
    name,
    lastOpenedAt: currentTime,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
  };
  const retrieval = await buildRetrievalSnapshot(id, rootPath);
  return { meta, recent, retrieval };
}
