import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  FileOutlineItem,
  GitBranchSummary,
  GitSnapshot,
  IpcResult,
  RecentWorkspaceEntry,
  RepoMapEntry,
  RetrievalFileTypeCount,
  RetrievalSnapshot,
  WorkspaceChangePreview,
  WorkspaceFileDocument,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
  WorkspaceSearchHit,
  WorkspaceTreeNode,
  WorkspaceType
} from "../src/kernel/index";
import { buildOutlineFromContent } from "../src/shared/outline";

const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const MAX_SEARCH_RESULTS = 200;
const MAX_TREE_DEPTH = 64;
const MAX_TREE_NODES = 200_000;
const MAX_COLLECTED_FILES = 50_000;
const GIT_TIMEOUT_MS = 30_000;
const IGNORED_DIRS = new Set([".git", "target", "node_modules", "dist", "build", ".next", ".cache"]);
const ROOT_MARKERS = [".git", "Cargo.toml", "package.json", "pyproject.toml", "go.mod", "pom.xml"];
const API_PREFIX = "/__adl_preview_api__";
const GIT_CANDIDATE_PATHS = process.platform === "win32"
  ? [
      "C:\\Program Files\\Git\\bin\\git.exe",
      "C:\\Program Files\\Git\\cmd\\git.exe",
    ]
  : [];

const WIN_SYSTEM_DIRS = process.platform === "win32"
  ? [
      "C:\\Windows\\System32",
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0",
      "C:\\Windows\\SysWOW64",
      "C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0",
      "C:\\Windows",
    ]
  : [];

const CSC_CANDIDATE_PATHS = process.platform === "win32"
  ? [
      "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
      "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe",
    ]
  : [];

const PICKER_CS_PATH = path.join(__dirname, "picker", "FolderPicker.cs");

interface ModuleState {
  gitBinary: string;
  gitResolved: boolean;
}

const moduleState: ModuleState = {
  gitBinary: "git",
  gitResolved: false,
};

async function resolveGitBinary(): Promise<string> {
  if (moduleState.gitResolved) return moduleState.gitBinary;

  const probe = (cmd: string): Promise<boolean> =>
    new Promise((resolve) => {
      const child = spawn(cmd, ["--version"], { windowsHide: true, stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });

  if (await probe("git")) {
    moduleState.gitBinary = "git";
    moduleState.gitResolved = true;
    return moduleState.gitBinary;
  }

  for (const candidate of GIT_CANDIDATE_PATHS) {
    if (fsSync.existsSync(candidate) && (await probe(candidate))) {
      moduleState.gitBinary = candidate;
      moduleState.gitResolved = true;
      return moduleState.gitBinary;
    }
  }

  moduleState.gitResolved = true;
  return moduleState.gitBinary;
}

async function resolveWindowsBinary(name: string): Promise<string> {
  const probe = (cmd: string): Promise<boolean> =>
    new Promise((resolve) => {
      const child = spawn(cmd, ["//?//"], { windowsHide: true, stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.on("close", () => resolve(true));
    });

  if (await probe(name)) {
    return name;
  }

  for (const dir of WIN_SYSTEM_DIRS) {
    const fullPath = path.join(dir, name);
    if (fsSync.existsSync(fullPath) && (await probe(fullPath))) {
      return fullPath;
    }
  }

  return name;
}

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
    if (results.length >= MAX_COLLECTED_FILES) return;
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
  return buildOutlineFromContent(document.content, normalizePath(relativeTarget));
}

async function runGit(rootPath: string, args: string[]): Promise<string | undefined> {
  const gitBin = await resolveGitBinary();
  return new Promise((resolve) => {
    const child = spawn(gitBin, args, { cwd: rootPath, windowsHide: true });
    let stdout = "";
    let timer: NodeJS.Timeout | undefined;
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", () => {
      if (timer) clearTimeout(timer);
      resolve(undefined);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve(code === 0 ? stdout.trim() : undefined);
    });
    timer = setTimeout(() => {
      child.kill();
      resolve(undefined);
    }, GIT_TIMEOUT_MS);
  });
}

async function captureGitSnapshot(rootPath: string): Promise<GitSnapshot> {
  const [branch, head, staged, unstaged, untracked, conflicts] = await Promise.all([
    runGit(rootPath, ["branch", "--show-current"]),
    runGit(rootPath, ["rev-parse", "--short", "HEAD"]),
    runGitNullSeparated(rootPath, ["diff", "--name-only", "--cached", "-z"]),
    runGitNullSeparated(rootPath, ["diff", "--name-only", "-z"]),
    runGitNullSeparated(rootPath, ["ls-files", "--others", "--exclude-standard", "-z"]),
    runGitNullSeparated(rootPath, ["diff", "--name-only", "--diff-filter=U", "-z"])
  ]);

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

async function runGitBytes(rootPath: string, args: string[]): Promise<Buffer | undefined> {
  const gitBin = await resolveGitBinary();
  return new Promise((resolve) => {
    const child = spawn(gitBin, args, { cwd: rootPath, windowsHide: true });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on("error", () => resolve(undefined));
    child.on("close", (code) => resolve(code === 0 ? Buffer.concat(chunks) : undefined));
  });
}

async function runGitNullSeparated(rootPath: string, args: string[]): Promise<string[]> {
  const stdout = await runGitBytes(rootPath, args);
  if (!stdout) {
    return [];
  }
  return stdout
    .toString("utf8")
    .split("\0")
    .filter((value) => value.length > 0)
    .map((value) => normalizePath(value));
}

async function gitHeadFileExists(rootPath: string, relativeTarget: string): Promise<boolean> {
  const gitBin = await resolveGitBinary();
  return new Promise((resolve) => {
    const child = spawn(gitBin, ["cat-file", "-e", `HEAD:${normalizePath(relativeTarget)}`], {
      cwd: rootPath,
      windowsHide: true
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function gitShowFile(rootPath: string, relativeTarget: string): Promise<string | undefined> {
  const stdout = await runGitBytes(rootPath, ["show", `HEAD:${normalizePath(relativeTarget)}`]);
  if (stdout && stdout.byteLength > DEFAULT_MAX_FILE_BYTES) {
    throw new Error(`git blob is too large to preview: ${normalizePath(relativeTarget)}`);
  }
  return stdout ? stdout.toString("utf8") : undefined;
}

async function readChangePreview(rootPath: string, relativeTarget: string): Promise<WorkspaceChangePreview> {
  const snapshot = await captureGitSnapshot(rootPath);
  if (!snapshot.isRepo) {
    throw new Error("active workspace is not a Git repository");
  }

  const normalizedTarget = normalizePath(relativeTarget);
  const status = snapshot.conflicts.includes(normalizedTarget)
    ? "conflicted"
    : snapshot.untracked.includes(normalizedTarget)
      ? "untracked"
      : snapshot.unstaged.includes(normalizedTarget)
        ? "modified"
        : snapshot.staged.includes(normalizedTarget)
          ? "staged"
          : undefined;

  if (!status) {
    throw new Error(`change preview for ${normalizedTarget} was not found`);
  }

  const absolutePath = resolveWorkspacePath(rootPath, normalizedTarget);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch {
    stats = undefined;
  }
  if (stats?.isDirectory()) {
    throw new Error(`change preview requires a file path: ${normalizedTarget}`);
  }

  const currentExists = stats?.isFile() ?? false;
  const currentContent = currentExists ? await fs.readFile(absolutePath, "utf8") : "";
  const baseContent = await gitShowFile(rootPath, normalizedTarget);
  const baseExists = typeof baseContent === "string" ? true : await gitHeadFileExists(rootPath, normalizedTarget);

  if (!baseExists && !currentExists) {
    throw new Error(`change preview source is unavailable: ${normalizedTarget}`);
  }

  return {
    path: normalizedTarget,
    changeKind: !baseExists ? "added" : !currentExists ? "deleted" : "modified",
    status,
    baseExists,
    currentExists,
    baseContent: baseContent ?? "",
    currentContent
  };
}

async function listGitBranches(rootPath: string): Promise<GitBranchSummary[]> {
  const [currentBranch, branchesOutput] = await Promise.all([
    runGit(rootPath, ["branch", "--show-current"]),
    runGit(rootPath, ["branch", "--format=%(refname:short)"])
  ]);
  const current = currentBranch?.trim();
  const branches = (branchesOutput ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name, isCurrent: name === current }));
  if (!branches.length) {
    throw new Error("no local branches found");
  }
  branches.sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent) || left.name.localeCompare(right.name));
  return branches;
}

async function runGitRequired(rootPath: string, args: string[]): Promise<string> {
  const output = await runGit(rootPath, args);
  if (typeof output === "string") {
    return output;
  }
  throw new Error(`git command failed: git ${args.join(" ")}`);
}

function hasLocalGitChanges(snapshot: GitSnapshot): boolean {
  return snapshot.staged.length > 0 || snapshot.unstaged.length > 0 || snapshot.untracked.length > 0;
}

async function stashWorkspaceChanges(rootPath: string): Promise<void> {
  await runGitRequired(rootPath, [
    "stash",
    "push",
    "--include-untracked",
    "--message",
    `adl-preview-auto-stash-${Date.now()}`
  ]);
}

async function updateWorkspaceMetaForBranchChange(rootPath: string): Promise<WorkspaceMeta> {
  const root = await detectWorkspaceRoot(rootPath);
  const currentTime = nowMs();
  return {
    id: createWorkspaceId(root),
    path: root,
    rootPath: root,
    name: path.basename(root) || root,
    type: await inferWorkspaceType(root),
    status: "ready",
    gitSnapshot: await captureGitSnapshot(root),
    createdAt: currentTime,
    updatedAt: currentTime,
    lastOpenedAt: currentTime
  };
}

async function switchGitBranch(
  rootPath: string,
  input: WorkspaceGitBranchSwitchInput
): Promise<WorkspaceGitBranchChangeResult> {
  const snapshot = await captureGitSnapshot(rootPath);
  if (!snapshot.isRepo) {
    throw new Error("active workspace is not a Git repository");
  }
  const branchName = input.branchName.trim();
  if (!branchName) {
    throw new Error("branchName is required");
  }
  const stashedChanges = hasLocalGitChanges(snapshot);
  if (stashedChanges && !input.allowStash) {
    throw new Error("Dirty worktree requires explicit stash confirmation.");
  }
  if (stashedChanges) {
    await stashWorkspaceChanges(rootPath);
  }
  await runGitRequired(rootPath, ["switch", branchName]);
  const workspace = await updateWorkspaceMetaForBranchChange(rootPath);
  return {
    workspace,
    gitSnapshot: workspace.gitSnapshot!,
    previousBranch: snapshot.branch,
    currentBranch: workspace.gitSnapshot?.branch ?? branchName,
    stashedChanges
  };
}

async function createGitBranch(
  rootPath: string,
  input: WorkspaceGitBranchCreateInput
): Promise<WorkspaceGitBranchChangeResult> {
  const snapshot = await captureGitSnapshot(rootPath);
  if (!snapshot.isRepo) {
    throw new Error("active workspace is not a Git repository");
  }
  const branchName = input.branchName.trim();
  if (!branchName) {
    throw new Error("branchName is required");
  }
  const currentBranch = snapshot.branch;
  if (!currentBranch) {
    throw new Error("failed to resolve current branch");
  }
  const baseBranch = input.baseBranch?.trim() || currentBranch;
  const stashedChanges = baseBranch !== currentBranch && hasLocalGitChanges(snapshot);
  if (stashedChanges && !input.allowStash) {
    throw new Error("Dirty worktree requires explicit stash confirmation.");
  }
  if (stashedChanges) {
    await stashWorkspaceChanges(rootPath);
  }
  if (baseBranch !== currentBranch) {
    await runGitRequired(rootPath, ["switch", baseBranch]);
  }
  await runGitRequired(rootPath, ["switch", "-c", branchName]);
  const workspace = await updateWorkspaceMetaForBranchChange(rootPath);
  return {
    workspace,
    gitSnapshot: workspace.gitSnapshot!,
    previousBranch: snapshot.branch,
    currentBranch: workspace.gitSnapshot?.branch ?? branchName,
    stashedChanges
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
  if (!fsSync.existsSync(workspacePath)) {
    fsSync.mkdirSync(workspacePath, { recursive: true });
  }
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

async function renameFile(rootPath: string, relativePath: string, newName: string): Promise<boolean> {
  const src = resolveWorkspacePath(rootPath, relativePath);
  if (!fsSync.existsSync(src)) {
    throw new Error(`path not found: ${relativePath}`);
  }
  const parent = path.dirname(src);
  const dst = path.join(parent, newName);
  if (fsSync.existsSync(dst)) {
    throw new Error(`target already exists: ${newName}`);
  }
  await fs.rename(src, dst);
  return true;
}

async function deleteFileEntry(rootPath: string, relativePath: string): Promise<boolean> {
  const target = resolveWorkspacePath(rootPath, relativePath);
  if (!fsSync.existsSync(target)) {
    throw new Error(`path not found: ${relativePath}`);
  }
  if (process.platform === "win32") {
    const psPath = target.replace(/'/g, "''");
    const isDir = fsSync.statSync(target).isDirectory();
    const method = isDir ? "DeleteDirectory" : "DeleteFile";
    const args = isDir ? `'${psPath}','OnlyErrorDialogs','SendToRecycleBin'` : `'${psPath}','OnlyErrorDialogs','SendToRecycleBin'`;
    await new Promise<void>((resolve, reject) => {
      const child = spawn("powershell", [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${method}(${args})`
      ], { windowsHide: true });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(); else reject(new Error(`PowerShell exit code ${code}`));
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

async function duplicateFile(rootPath: string, srcRelativePath: string, dstRelativePath: string): Promise<boolean> {
  const src = resolveWorkspacePath(rootPath, srcRelativePath);
  if (!fsSync.existsSync(src)) {
    throw new Error(`source not found: ${srcRelativePath}`);
  }
  let dst = path.resolve(rootPath, dstRelativePath);
  if (fsSync.existsSync(dst)) {
    const ext = path.extname(dst);
    const dir = path.dirname(dst);
    const base = path.basename(dst, ext);
    let i = 1;
    while (fsSync.existsSync(dst)) {
      dst = path.join(dir, `${base}-copy${i}${ext}`);
      i += 1;
      if (i > 100) throw new Error(`too many conflict attempts`);
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

async function moveFile(rootPath: string, relativePath: string, newPath: string): Promise<boolean> {
  const src = resolveWorkspacePath(rootPath, relativePath);
  if (!fsSync.existsSync(src)) {
    throw new Error(`source not found: ${relativePath}`);
  }
  const dst = resolveWorkspacePath(rootPath, newPath);
  if (fsSync.existsSync(dst)) {
    throw new Error(`target already exists: ${newPath}`);
  }
  const dstParent = path.dirname(dst);
  await fs.mkdir(dstParent, { recursive: true });
  await fs.rename(src, dst);
  return true;
}

async function getAbsolutePath(rootPath: string, relativePath: string): Promise<string> {
  const resolved = resolveWorkspacePath(rootPath, relativePath);
  return normalizePath(resolved);
}

async function revealInFileManager(targetPath: string): Promise<boolean> {
  const normalizedPath = process.platform === "win32" ? targetPath.replace(/\//g, "\\") : targetPath;
  const absolutePath = path.resolve(normalizedPath);
  if (!fsSync.existsSync(absolutePath)) {
    throw new Error(`path does not exist: ${targetPath}`);
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("cmd.exe", ["/c", "start", "", "explorer", `/select,${absolutePath}`], {
        windowsHide: false,
        detached: true,
        shell: false,
      });
      child.on("error", (err) => {
        console.error("Explorer spawn error:", err);
        reject(err);
      });
      child.on("spawn", () => resolve());
    });
    return true;
  }

  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, [absolutePath], { windowsHide: true });
    child.on("error", reject);
    child.on("spawn", () => resolve());
  });
  return true;
}

let compiledPickerExe: string | undefined;

async function compileFolderPicker(): Promise<string | undefined> {
  if (compiledPickerExe && fsSync.existsSync(compiledPickerExe)) {
    return compiledPickerExe;
  }
  if (!fsSync.existsSync(PICKER_CS_PATH)) {
    return undefined;
  }
  const outputExe = PICKER_CS_PATH.replace(/\.cs$/, ".exe");
  for (const csc of CSC_CANDIDATE_PATHS) {
    if (!fsSync.existsSync(csc)) continue;
    const success = await new Promise<boolean>((resolve) => {
      const child = spawn(csc, ["/nologo", "/target:exe", `/out:${outputExe}`, PICKER_CS_PATH], { windowsHide: true });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
    if (success && fsSync.existsSync(outputExe)) {
      compiledPickerExe = outputExe;
      return compiledPickerExe;
    }
  }
  return undefined;
}

async function runFolderPickerCsharp(exe: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(exe, [], {
      windowsHide: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.on("error", () => resolve(undefined));
    child.on("close", (code) => {
      const selected = stdout.trim();
      resolve(code === 0 && selected ? selected : undefined);
    });
  });
}

async function runFolderPickerPowerShell(): Promise<string | undefined> {
  const psPath = await resolveWindowsBinary("powershell.exe");
  const psScript = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$d.Description = "Select workspace folder"',
    '$d.ShowNewFolderButton = $true',
    'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  [Console]::Write($d.SelectedPath)',
    '}',
  ].join("; ");

  return new Promise((resolve) => {
    const child = spawn(psPath, [
      "-NoProfile", "-Sta",
      "-Command", psScript,
    ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.on("error", () => resolve(undefined));
    child.on("close", () => {
      const selected = stdout.trim();
      resolve(selected || undefined);
    });
  });
}

async function pickDirectory(): Promise<string | undefined> {
  if (process.platform === "win32") {
    const exe = await compileFolderPicker();
    if (exe) {
      return runFolderPickerCsharp(exe);
    }
    return runFolderPickerPowerShell();
  }

  if (process.platform === "darwin") {
    return new Promise((resolve) => {
      const child = spawn("osascript", [
        "-e",
        'set chosenFolder to choose folder with prompt "Select workspace folder"',
        "-e",
        "POSIX path of chosenFolder",
      ], { windowsHide: true });
      let stdout = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.on("error", () => resolve(undefined));
      child.on("close", (code) => {
        if (code !== 0) {
          resolve(undefined);
          return;
        }
        const selected = stdout.trim();
        resolve(selected || undefined);
      });
    });
  }

  return new Promise((resolve) => {
    const child = spawn("zenity", ["--file-selection", "--directory", "--title=Select workspace folder"], { windowsHide: true });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", () => resolve(undefined));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(undefined);
        return;
      }
      const selected = stdout.trim();
      resolve(selected || undefined);
    });
  });
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

    if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/workspace/pick-directory`) {
      const selectedPath = await pickDirectory();
      writeJson(response, ok(selectedPath));
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

    if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/workspace/app-directory`) {
      writeJson(response, ok(process.cwd()));
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

    if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/workspace/rename-file`) {
      const body = (await readBody(request)) as { rootPath?: string; relativePath?: string; newName?: string } | undefined;
      if (!body?.rootPath?.trim() || !body?.relativePath?.trim() || !body?.newName?.trim()) {
        writeJson(response, fail("rootPath, relativePath, and newName are required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await renameFile(body.rootPath.trim(), body.relativePath.trim(), body.newName.trim())));
      return true;
    }

    if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/workspace/delete-file`) {
      const body = (await readBody(request)) as { rootPath?: string; relativePath?: string } | undefined;
      if (!body?.rootPath?.trim() || !body?.relativePath?.trim()) {
        writeJson(response, fail("rootPath and relativePath are required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await deleteFileEntry(body.rootPath.trim(), body.relativePath.trim())));
      return true;
    }

    if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/workspace/duplicate-file`) {
      const body = (await readBody(request)) as { rootPath?: string; srcRelativePath?: string; dstRelativePath?: string } | undefined;
      if (!body?.rootPath?.trim() || !body?.srcRelativePath?.trim() || !body?.dstRelativePath?.trim()) {
        writeJson(response, fail("rootPath, srcRelativePath, and dstRelativePath are required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await duplicateFile(body.rootPath.trim(), body.srcRelativePath.trim(), body.dstRelativePath.trim())));
      return true;
    }

    if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/workspace/move-file`) {
      const body = (await readBody(request)) as { rootPath?: string; relativePath?: string; newPath?: string } | undefined;
      if (!body?.rootPath?.trim() || !body?.relativePath?.trim() || !body?.newPath?.trim()) {
        writeJson(response, fail("rootPath, relativePath, and newPath are required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await moveFile(body.rootPath.trim(), body.relativePath.trim(), body.newPath.trim())));
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
    if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/workspace/change-preview`) {
      const relativeTarget = requestUrl.searchParams.get("relativePath");
      if (!relativeTarget?.trim()) {
        writeJson(response, fail("relativePath is required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await readChangePreview(rootPath, relativeTarget)));
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
    if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/workspace/git-branches`) {
      try {
        writeJson(response, ok(await listGitBranches(rootPath)));
      } catch {
        writeJson(response, ok<GitBranchSummary[]>([]));
      }
      return true;
    }
    if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/workspace/git-switch`) {
      const body = (await readBody(request)) as WorkspaceGitBranchSwitchInput | undefined;
      if (!body) {
        writeJson(response, fail("branch switch payload is required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await switchGitBranch(rootPath, body)));
      return true;
    }
    if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/workspace/git-create-branch`) {
      const body = (await readBody(request)) as WorkspaceGitBranchCreateInput | undefined;
      if (!body) {
        writeJson(response, fail("branch creation payload is required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await createGitBranch(rootPath, body)));
      return true;
    }
    if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/workspace/absolute-path`) {
      const relativePath = requestUrl.searchParams.get("relativePath");
      if (!relativePath?.trim()) {
        writeJson(response, fail("relativePath is required", "INVALID_INPUT"));
        return true;
      }
      writeJson(response, ok(await getAbsolutePath(rootPath, relativePath)));
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
