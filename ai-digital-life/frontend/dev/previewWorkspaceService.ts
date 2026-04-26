import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  FileOutlineItem,
  GitSnapshot,
  IpcResult,
  RecentWorkspaceEntry,
  RepoMapEntry,
  RetrievalFileTypeCount,
  RetrievalSnapshot,
  WorkspaceFileDocument,
  WorkspaceMeta,
  WorkspaceSearchHit,
  WorkspaceTreeNode,
  WorkspaceType
} from "../src/kernel/index";

const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const MAX_SEARCH_RESULTS = 200;
const MAX_TREE_DEPTH = 64;
const MAX_TREE_NODES = 200_000;
const IGNORED_DIRS = new Set([".git", "target", "node_modules", "dist", "build", ".next", ".cache"]);
const ROOT_MARKERS = [".git", "Cargo.toml", "package.json", "pyproject.toml", "go.mod", "pom.xml"];
const API_PREFIX = "/__adl_preview_api__";

type PreviewWorkspacePayload = {
  meta: WorkspaceMeta;
  recent: RecentWorkspaceEntry;
  retrieval: RetrievalSnapshot;
};

type HandlerResult = IpcResult<unknown>;

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail<T>(message: string, code = "PREVIEW_WORKSPACE_ERROR"): IpcResult<T> {
  return { ok: false, error: { code, message } };
}

function nowMs(): number {
  return Date.now();
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function detectWorkspaceRoot(inputPath: string): Promise<string> {
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

async function inferWorkspaceType(rootPath: string): Promise<WorkspaceType> {
  const markers: Array<[string, WorkspaceType]> = [
    ["Cargo.toml", "rust"],
    ["package.json", "node"],
    ["pyproject.toml", "python"],
    ["requirements.txt", "python"],
    ["go.mod", "go"],
    ["pom.xml", "java"],
    ["build.gradle", "java"]
  ];
  for (const [marker, workspaceType] of markers) {
    if (ROOT_MARKERS.includes(marker) || marker === "requirements.txt" || marker === "build.gradle") {
      if (await pathExists(path.join(rootPath, marker))) {
        return workspaceType;
      }
    }
  }
  return "unknown";
}

function createWorkspaceId(rootPath: string): string {
  const normalized = normalizePath(rootPath).toLowerCase();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0;
  }
  return `workspace_${Math.abs(hash).toString(16).padStart(8, "0")}`;
}

function relativePath(rootPath: string, targetPath: string): string {
  return normalizePath(path.relative(rootPath, targetPath));
}

function resolveWorkspacePath(rootPath: string, relativeTarget: string): string {
  const resolved = path.resolve(rootPath, relativeTarget);
  const normalizedRoot = `${path.resolve(rootPath)}${path.sep}`;
  const normalizedResolved = path.resolve(resolved);
  if (normalizedResolved !== path.resolve(rootPath) && !normalizedResolved.startsWith(normalizedRoot)) {
    throw new Error(`path escapes workspace: ${relativeTarget}`);
  }
  return normalizedResolved;
}

async function listTree(rootPath: string): Promise<WorkspaceTreeNode[]> {
  let remaining = MAX_TREE_NODES;
  return listTreeInner(rootPath, rootPath, 0, () => remaining, (next) => {
    remaining = next;
  });
}

async function listTreeInner(
  rootPath: string,
  currentPath: string,
  depth: number,
  getRemaining: () => number,
  setRemaining: (value: number) => void
): Promise<WorkspaceTreeNode[]> {
  if (getRemaining() === 0 || depth > MAX_TREE_DEPTH) {
    return [];
  }

  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: WorkspaceTreeNode[] = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (getRemaining() === 0) {
      break;
    }

    const entryPath = path.join(currentPath, entry.name);
    const nodePath = relativePath(rootPath, entryPath);
    setRemaining(getRemaining() - 1);

    if (entry.isDirectory()) {
      nodes.push({
        path: nodePath,
        name: entry.name,
        kind: "directory",
        children: await listTreeInner(rootPath, entryPath, depth + 1, getRemaining, setRemaining)
      });
      continue;
    }

    if (entry.isFile()) {
      nodes.push({
        path: nodePath,
        name: entry.name,
        kind: "file",
        children: []
      });
    }
  }

  nodes.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
  return nodes;
}

async function readFile(rootPath: string, relativeTarget: string): Promise<WorkspaceFileDocument> {
  const absolutePath = resolveWorkspacePath(rootPath, relativeTarget);
  const stats = await fs.stat(absolutePath);
  if (stats.size > DEFAULT_MAX_FILE_BYTES) {
    throw new Error(`file too large: ${relativeTarget}`);
  }
  const content = await fs.readFile(absolutePath, "utf8");
  return {
    path: normalizePath(relativeTarget),
    content,
    lastModifiedAt: stats.mtimeMs
  };
}

async function createFile(
  rootPath: string,
  relativeTarget: string,
  content = ""
): Promise<WorkspaceFileDocument> {
  const absolutePath = resolveWorkspacePath(rootPath, relativeTarget);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch {
    stats = undefined;
  }
  if (stats?.isDirectory()) {
    throw new Error(`directory already exists: ${relativeTarget}`);
  }
  if (stats?.isFile()) {
    throw new Error(`file already exists: ${relativeTarget}`);
  }
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
  return readFile(rootPath, relativeTarget);
}

async function createFolder(rootPath: string, relativeTarget: string): Promise<boolean> {
  const absolutePath = resolveWorkspacePath(rootPath, relativeTarget);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch {
    stats = undefined;
  }
  if (stats?.isFile()) {
    throw new Error(`file already exists at: ${relativeTarget}`);
  }
  if (stats?.isDirectory()) {
    throw new Error(`directory already exists: ${relativeTarget}`);
  }
  await fs.mkdir(absolutePath, { recursive: true });
  return true;
}

async function collectTextFiles(rootPath: string, currentPath: string, results: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name) || entry.isSymbolicLink()) {
      continue;
    }
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await collectTextFiles(rootPath, entryPath, results);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    let stats;
    try {
      stats = await fs.stat(entryPath);
    } catch {
      continue;
    }
    if (stats.size > DEFAULT_MAX_FILE_BYTES) {
      continue;
    }
    try {
      await fs.readFile(entryPath, "utf8");
      results.push(entryPath);
    } catch {
      continue;
    }
  }
}

async function searchText(rootPath: string, query: string): Promise<WorkspaceSearchHit[]> {
  if (!query.trim()) {
    return [];
  }
  const files: string[] = [];
  await collectTextFiles(rootPath, rootPath, files);
  const needle = query.toLowerCase();
  const hits: WorkspaceSearchHit[] = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const workspaceRelativePath = relativePath(rootPath, filePath);
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].toLowerCase().includes(needle)) {
        continue;
      }
      hits.push({
        path: workspaceRelativePath,
        line: index + 1,
        preview: lines[index].trim().slice(0, 240)
      });
      if (hits.length >= MAX_SEARCH_RESULTS) {
        return hits;
      }
    }
  }
  return hits;
}

async function outline(rootPath: string, relativeTarget: string): Promise<FileOutlineItem[]> {
  const document = await readFile(rootPath, relativeTarget);
  const items: FileOutlineItem[] = [];
  const candidates: Array<[string, FileOutlineItem["kind"]]> = [
    ["function ", "function"],
    ["fn ", "function"],
    ["class ", "class"],
    ["interface ", "interface"],
    ["type ", "type"],
    ["const ", "const"],
    ["pub fn ", "function"],
    ["struct ", "class"],
    ["enum ", "type"],
    ["# ", "heading"],
    ["## ", "heading"]
  ];

  document.content.split(/\r?\n/).forEach((lineText, index) => {
    const trimmed = lineText.trimStart();
    for (const [prefix, kind] of candidates) {
      const label = trimmed.replace(/^export\s+/, "").startsWith(prefix)
        ? trimmed.replace(/^export\s+/, "").slice(prefix.length)
        : undefined;
      if (!label) {
        continue;
      }
      const title = label
        .split(/[\s({:]/)[0]
        ?.trim()
        .replace(/^#+/, "");
      if (!title) {
        break;
      }
      items.push({
        id: `${normalizePath(relativeTarget)}:${index + 1}`,
        label: title,
        kind,
        line: index + 1
      });
      break;
    }
  });
  return items;
}

function runGit(rootPath: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd: rootPath, windowsHide: true });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", () => resolve(undefined));
    child.on("close", (code) => resolve(code === 0 ? stdout.trim() : undefined));
  });
}

async function captureGitSnapshot(rootPath: string): Promise<GitSnapshot> {
  const [branch, head, porcelain] = await Promise.all([
    runGit(rootPath, ["branch", "--show-current"]),
    runGit(rootPath, ["rev-parse", "--short", "HEAD"]),
    runGit(rootPath, ["status", "--porcelain"])
  ]);

  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  const conflicts: string[] = [];

  for (const line of (porcelain ?? "").split(/\r?\n/)) {
    if (line.length < 3) {
      continue;
    }
    const status = line.slice(0, 2);
    const filePath = line.slice(3);
    if (status === "??") {
      untracked.push(filePath);
      continue;
    }
    if (status.includes("U") || status === "AA" || status === "DD") {
      conflicts.push(filePath);
      continue;
    }
    if (status[0]?.trim()) {
      staged.push(filePath);
    }
    if (status[1]?.trim()) {
      unstaged.push(filePath);
    }
  }

  return {
    isRepo: Boolean(branch || head),
    branch: branch || undefined,
    head: head || undefined,
    ahead: undefined,
    behind: undefined,
    staged,
    unstaged,
    untracked,
    conflicts,
    capturedAt: nowMs()
  };
}

async function buildRetrievalSnapshot(workspaceId: string, rootPath: string): Promise<RetrievalSnapshot> {
  const files: string[] = [];
  await collectTextFiles(rootPath, rootPath, files);
  const extensionCounts = new Map<string, number>();
  for (const filePath of files) {
    const extension = path.extname(filePath) || "[none]";
    extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
  }
  const topExtensions: RetrievalFileTypeCount[] = Array.from(extensionCounts.entries())
    .map(([extension, count]) => ({ extension, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 12);

  const flattenTree = (nodes: WorkspaceTreeNode[], entries: RepoMapEntry[]) => {
    for (const node of nodes) {
      entries.push({ path: node.path, type: node.kind });
      if (node.children.length > 0) {
        flattenTree(node.children, entries);
      }
    }
  };

  const tree = await listTree(rootPath);
  const repoMap: RepoMapEntry[] = [];
  flattenTree(tree, repoMap);

  return {
    workspaceId,
    rootPath,
    status: "completed",
    scannedFiles: files.length,
    indexedTextFiles: files.length,
    startedAt: nowMs(),
    updatedAt: nowMs(),
    completedAt: nowMs(),
    lastError: undefined,
    topExtensions,
    repoMap
  };
}

async function openWorkspace(workspacePath: string): Promise<PreviewWorkspacePayload> {
  const rootPath = await detectWorkspaceRoot(workspacePath);
  const name = path.basename(rootPath) || rootPath;
  const id = createWorkspaceId(rootPath);
  const currentTime = nowMs();
  const gitSnapshot = await captureGitSnapshot(rootPath);
  const meta: WorkspaceMeta = {
    id,
    path: rootPath,
    rootPath,
    name,
    type: await inferWorkspaceType(rootPath),
    status: "ready",
    gitSnapshot,
    createdAt: currentTime,
    updatedAt: currentTime,
    lastOpenedAt: currentTime
  };
  const recent: RecentWorkspaceEntry = {
    id,
    path: rootPath,
    rootPath,
    name,
    lastOpenedAt: currentTime,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true
  };
  const retrieval = await buildRetrievalSnapshot(id, rootPath);
  return { meta, recent, retrieval };
}

async function revealInFileManager(targetPath: string): Promise<boolean> {
  const absolutePath = path.resolve(targetPath);
  if (!fsSync.existsSync(absolutePath)) {
    throw new Error(`path does not exist: ${targetPath}`);
  }

  const command =
    process.platform === "win32"
      ? { cmd: "explorer", args: [absolutePath] }
      : process.platform === "darwin"
        ? { cmd: "open", args: [absolutePath] }
        : { cmd: "xdg-open", args: [absolutePath] };

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.cmd, command.args, { windowsHide: true });
    child.on("error", reject);
    child.on("spawn", () => resolve());
  });
  return true;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(response: ServerResponse, payload: HandlerResult) {
  response.statusCode = payload.ok ? 200 : 400;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

export function isPreviewWorkspaceApiRequest(url: string | undefined): boolean {
  return Boolean(url && url.startsWith(API_PREFIX));
}

export async function handlePreviewWorkspaceApi(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? API_PREFIX, "http://127.0.0.1");
  if (!isPreviewWorkspaceApiRequest(requestUrl.pathname)) {
    return false;
  }

  try {
    if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/workspace/open`) {
      const body = (await readBody(request)) as { workspacePath?: string } | undefined;
      if (!body?.workspacePath?.trim()) {
        writeJson(response, fail("workspacePath is required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await openWorkspace(body.workspacePath.trim())));
      return true;
    }

    if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/workspace/reveal`) {
      const body = (await readBody(request)) as { path?: string } | undefined;
      if (!body?.path?.trim()) {
        writeJson(response, fail("path is required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await revealInFileManager(body.path.trim())));
      return true;
    }

    if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/workspace/create-file`) {
      const body = (await readBody(request)) as
        | { rootPath?: string; relativePath?: string; content?: string }
        | undefined;
      if (!body?.rootPath?.trim() || !body?.relativePath?.trim()) {
        writeJson(response, fail("rootPath and relativePath are required", "INVALID_INPUT"));
        return true;
      }
      writeJson(
        response,
        ok(await createFile(body.rootPath.trim(), body.relativePath.trim(), body.content ?? ""))
      );
      return true;
    }

    if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/workspace/create-folder`) {
      const body = (await readBody(request)) as { rootPath?: string; relativePath?: string } | undefined;
      if (!body?.rootPath?.trim() || !body?.relativePath?.trim()) {
        writeJson(response, fail("rootPath and relativePath are required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await createFolder(body.rootPath.trim(), body.relativePath.trim())));
      return true;
    }

    const rootPath = requestUrl.searchParams.get("rootPath");
    if (!rootPath?.trim()) {
      writeJson(response, fail("rootPath is required", "INVALID_INPUT"));
      return true;
    }

    if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/workspace/tree`) {
      writeJson(response, ok(await listTree(rootPath)));
      return true;
    }
    if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/workspace/file`) {
      const relativeTarget = requestUrl.searchParams.get("relativePath");
      if (!relativeTarget?.trim()) {
        writeJson(response, fail("relativePath is required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await readFile(rootPath, relativeTarget)));
      return true;
    }
    if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/workspace/search`) {
      writeJson(response, ok(await searchText(rootPath, requestUrl.searchParams.get("query") ?? "")));
      return true;
    }
    if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/workspace/outline`) {
      const relativeTarget = requestUrl.searchParams.get("relativePath");
      if (!relativeTarget?.trim()) {
        writeJson(response, fail("relativePath is required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await outline(rootPath, relativeTarget)));
      return true;
    }
    if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/workspace/git-status`) {
      writeJson(response, ok(await captureGitSnapshot(rootPath)));
      return true;
    }
    if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/retrieval/status`) {
      const workspaceId = requestUrl.searchParams.get("workspaceId") ?? createWorkspaceId(rootPath);
      writeJson(response, ok(await buildRetrievalSnapshot(workspaceId, rootPath)));
      return true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson(response, fail(message));
    return true;
  }

  writeJson(response, fail("unsupported preview workspace route", "NOT_FOUND"));
  return true;
}
