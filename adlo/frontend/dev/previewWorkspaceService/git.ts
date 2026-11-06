import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  GitSnapshot,
  GitBranchSummary,
  GitDivergeStatus,
  GitSwitchMode,
  WorktreeInfo,
  WorkspaceGitBranchSwitchInput,
  WorkspaceGitBranchCreateInput,
  WorkspaceWorktreeEnsureInput,
  WorkspaceWorktreeEnsureResult,
  WorkspaceWorktreeRemoveInput,
  WorkspaceChangePreview,
} from '../../src/kernel/index';
import {
  resolveWorkspacePath,
  normalizePath,
  relativePath,
  detectWorkspaceRoot,
  inferWorkspaceType,
  createWorkspaceId,
  nowMs,
  DEFAULT_MAX_TEXT_FILE_BYTES,
} from './files';

const GIT_TIMEOUT_MS = 30_000;
const GIT_CANDIDATE_PATHS =
  process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\bin\\git.exe', 'C:\\Program Files\\Git\\cmd\\git.exe']
    : [];

interface ModuleState {
  gitBinary: string;
  gitResolved: boolean;
}

const moduleState: ModuleState = {
  gitBinary: 'git',
  gitResolved: false,
};

export async function resolveGitBinary(): Promise<string> {
  if (moduleState.gitResolved) return moduleState.gitBinary;

  const probe = (cmd: string): Promise<boolean> =>
    new Promise((resolve) => {
      const child = spawn(cmd, ['--version'], { windowsHide: true, stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });

  if (await probe('git')) {
    moduleState.gitBinary = 'git';
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

export async function runGit(rootPath: string, args: string[]): Promise<string | undefined> {
  const gitBin = await resolveGitBinary();
  return new Promise((resolve) => {
    const child = spawn(gitBin, args, { cwd: rootPath, windowsHide: true });
    let stdout = '';
    let timer: NodeJS.Timeout | undefined;
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.on('error', () => {
      if (timer) clearTimeout(timer);
      resolve(undefined);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve(code === 0 ? stdout.trim() : undefined);
    });
    timer = setTimeout(() => {
      child.kill();
      resolve(undefined);
    }, GIT_TIMEOUT_MS);
  });
}

async function runGitBytes(rootPath: string, args: string[]): Promise<Buffer | undefined> {
  const gitBin = await resolveGitBinary();
  return new Promise((resolve) => {
    const child = spawn(gitBin, args, { cwd: rootPath, windowsHide: true });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on('error', () => resolve(undefined));
    child.on('close', (code) => resolve(code === 0 ? Buffer.concat(chunks) : undefined));
  });
}

async function runGitNullSeparated(rootPath: string, args: string[]): Promise<string[]> {
  const stdout = await runGitBytes(rootPath, args);
  if (!stdout) return [];
  return stdout
    .toString('utf8')
    .split('\0')
    .filter((value) => value.length > 0)
    .map((value) => normalizePath(value));
}

export async function captureGitSnapshot(rootPath: string): Promise<GitSnapshot> {
  const [branch, head, staged, unstaged, untracked, conflicts] = await Promise.all([
    runGit(rootPath, ['branch', '--show-current']),
    runGit(rootPath, ['rev-parse', '--short', 'HEAD']),
    runGitNullSeparated(rootPath, ['diff', '--name-only', '--cached', '-z']),
    runGitNullSeparated(rootPath, ['diff', '--name-only', '-z']),
    runGitNullSeparated(rootPath, ['ls-files', '--others', '--exclude-standard', '-z']),
    runGitNullSeparated(rootPath, ['diff', '--name-only', '--diff-filter=U', '-z']),
  ]);

  return {
    isRepo: fsSync.existsSync(path.join(rootPath, '.git')) || Boolean(branch || head),
    branch: branch || undefined,
    head: head || undefined,
    ahead: undefined,
    behind: undefined,
    staged,
    unstaged,
    untracked,
    conflicts,
    capturedAt: nowMs(),
  };
}

/**
 * 在当前工作区根目录初始化**本地** Git 仓库（幂等）。
 * 只创建 `.git`，不联网、不添加远程、不改动/删除/提交任何现有文件。
 */
export async function initGitRepo(rootPath: string): Promise<GitSnapshot> {
  const stat = await fs.stat(rootPath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`workspace path is not a directory: ${rootPath}`);
  }
  if (!fsSync.existsSync(path.join(rootPath, '.git'))) {
    const output = await runGit(rootPath, ['init']);
    if (output === undefined) {
      throw new Error('git init failed');
    }
  }
  return captureGitSnapshot(rootPath);
}

async function gitHeadFileExists(rootPath: string, relativeTarget: string): Promise<boolean> {
  const gitBin = await resolveGitBinary();
  return new Promise((resolve) => {
    const child = spawn(gitBin, ['cat-file', '-e', `HEAD:${normalizePath(relativeTarget)}`], {
      cwd: rootPath,
      windowsHide: true,
    });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function gitShowFile(rootPath: string, relativeTarget: string): Promise<string | undefined> {
  const stdout = await runGitBytes(rootPath, ['show', `HEAD:${normalizePath(relativeTarget)}`]);
  // 事项3：与 Rust read_change_preview / 用户主动开文件对齐到 8MB（此前 1MB，
  // 超限先于前端 HeavyPreviewGate 拒掉）。是否渲染由前端 1M 字符确认门决定。
  if (stdout && stdout.byteLength > DEFAULT_MAX_TEXT_FILE_BYTES) {
    throw new Error(`git blob is too large to preview: ${normalizePath(relativeTarget)}`);
  }
  return stdout ? stdout.toString('utf8') : undefined;
}

export async function readChangePreview(
  rootPath: string,
  relativeTarget: string,
): Promise<WorkspaceChangePreview> {
  const snapshot = await captureGitSnapshot(rootPath);
  if (!snapshot.isRepo) throw new Error('active workspace is not a Git repository');

  const normalizedTarget = normalizePath(relativeTarget);
  const status = snapshot.conflicts.includes(normalizedTarget)
    ? 'conflicted'
    : snapshot.untracked.includes(normalizedTarget)
      ? 'untracked'
      : snapshot.unstaged.includes(normalizedTarget)
        ? 'modified'
        : snapshot.staged.includes(normalizedTarget)
          ? 'staged'
          : undefined;

  if (!status) throw new Error(`change preview for ${normalizedTarget} was not found`);

  const absolutePath = resolveWorkspacePath(rootPath, normalizedTarget);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch {
    stats = undefined;
  }
  if (stats?.isDirectory())
    throw new Error(`change preview requires a file path: ${normalizedTarget}`);

  const currentExists = stats?.isFile() ?? false;
  // 与 Rust read_change_preview 对齐（复审 3-1）：current 侧同样受 8MB 文本上限，
  // 超限即失败，由前端确认门承担"读到之后是否渲染"（此前直接整读无上限）。
  if (currentExists && (stats?.size ?? 0) > DEFAULT_MAX_TEXT_FILE_BYTES) {
    throw new Error(`file exceeds configured read limit: ${normalizedTarget}`);
  }
  const currentContent = currentExists ? await fs.readFile(absolutePath, 'utf8') : '';
  const baseContent = await gitShowFile(rootPath, normalizedTarget);
  const baseExists =
    typeof baseContent === 'string' ? true : await gitHeadFileExists(rootPath, normalizedTarget);

  if (!baseExists && !currentExists)
    throw new Error(`change preview source is unavailable: ${normalizedTarget}`);

  return {
    path: normalizedTarget,
    changeKind: !baseExists ? 'added' : !currentExists ? 'deleted' : 'modified',
    status,
    baseExists,
    currentExists,
    baseContent: baseContent ?? '',
    currentContent,
  };
}

function divergeStatusFor(ahead?: number, behind?: number): GitDivergeStatus | undefined {
  if (ahead === undefined || behind === undefined) return undefined;
  if (ahead === 0 && behind === 0) return 'synced';
  if (ahead > 0 && behind === 0) return 'ahead';
  if (ahead === 0 && behind > 0) return 'behind';
  if (ahead > 0 && behind > 0) return 'diverged';
  return undefined;
}

async function branchUpstreams(rootPath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const output = await runGit(rootPath, [
    'for-each-ref',
    '--format=%(refname:short)%09%(upstream:short)',
    'refs/heads',
  ]);
  if (!output) return map;
  for (const line of output.split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const branch = line.slice(0, tab).trim();
    const upstream = line.slice(tab + 1).trim();
    if (branch && upstream) map.set(branch, upstream);
  }
  return map;
}

async function stashedBranches(rootPath: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const output = await runGit(rootPath, ['stash', 'list', '--format=%s']);
  if (!output) return counts;
  for (const line of output.split(/\r?\n/)) {
    const marker = 'adl-auto-stash:';
    const pos = line.indexOf(marker);
    if (pos < 0) continue;
    const rest = line.slice(pos + marker.length);
    const end = rest.indexOf(':');
    const branch = (end < 0 ? rest : rest.slice(0, end)).trim();
    if (branch) counts.set(branch, (counts.get(branch) ?? 0) + 1);
  }
  return counts;
}

async function divergenceCounts(
  rootPath: string,
  local: string,
  upstream: string,
): Promise<[number, number] | undefined> {
  const output = await runGit(rootPath, [
    'rev-list',
    '--left-right',
    '--count',
    `${local}...${upstream}`,
  ]);
  if (!output) return undefined;
  const parts = output.split(/\s+/);
  if (parts.length < 2) return undefined;
  const ahead = Number(parts[0]);
  const behind = Number(parts[1]);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return undefined;
  return [ahead, behind];
}

interface ParsedWorktree {
  branch?: string;
  path: string;
  isMain: boolean;
  locked: boolean;
  prunable: boolean;
  head?: string;
}

function parseWorktreeList(output: string): ParsedWorktree[] {
  const entries: ParsedWorktree[] = [];
  let current: ParsedWorktree | undefined;
  const flush = () => {
    if (current) {
      current.isMain = entries.length === 0;
      entries.push(current);
      current = undefined;
    }
  };
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith('worktree ')) {
      flush();
      // Git 输出恒用 `/`，Node/前端用系统分隔符：归一化后比较/聚焦才对得上。
      const rawPath = line.slice('worktree '.length).trim();
      current = { path: path.normalize(rawPath), isMain: false, locked: false, prunable: false };
    } else if (line.startsWith('HEAD ') && current) {
      current.head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ') && current) {
      const ref = line.slice('branch '.length).trim();
      current.branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
    } else if (line === 'detached' && current) {
      current.branch = undefined;
    } else if (line.startsWith('locked') && current) {
      current.locked = true;
    } else if (line.startsWith('prunable') && current) {
      current.prunable = true;
    }
  }
  flush();
  return entries;
}

export async function listWorktrees(rootPath: string): Promise<WorktreeInfo[]> {
  const output = await runGitRequired(rootPath, ['worktree', 'list', '--porcelain']);
  return parseWorktreeList(output);
}

function worktreeForBranch(worktrees: ParsedWorktree[], branchName: string): string | undefined {
  return worktrees.find((entry) => entry.branch === branchName)?.path;
}

async function remoteTrackingRef(
  rootPath: string,
  branchName: string,
): Promise<string | undefined> {
  const output = await runGit(rootPath, ['branch', '-r', '--format=%(refname:short)']);
  if (!output) return undefined;
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes('->')) continue;
    const slash = trimmed.indexOf('/');
    if (slash > 0 && trimmed.slice(slash + 1) === branchName) return trimmed;
  }
  return undefined;
}

async function hasLocalBranch(rootPath: string, branchName: string): Promise<boolean> {
  const output = await runGit(rootPath, [
    'show-ref',
    '--verify',
    '--quiet',
    `refs/heads/${branchName}`,
  ]);
  // show-ref --quiet prints nothing on success; runGit resolves undefined on failure.
  // Success path still needs an explicit check: use branch --list as fallback.
  if (output !== undefined) return true;
  const list = await runGit(rootPath, [
    'branch',
    '--list',
    branchName,
    '--format=%(refname:short)',
  ]);
  return (list ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .includes(branchName);
}

export function sanitizeBranchDir(branchName: string): string {
  const sanitized = branchName
    .trim()
    .replace(/[/\\:<>\"|?*.\u0000-\u001F]/g, '-')
    .replace(/^[- .]+|[- .]+$/g, '');
  return sanitized || 'branch';
}

export function siblingWorktreeDir(rootPath: string, branchName: string): string {
  const base = sanitizeBranchDir(branchName);
  const parent = path.dirname(path.resolve(rootPath));
  const rootName = path.basename(path.resolve(rootPath)) || 'workspace';
  const container = path.join(parent, `${rootName}-worktrees`);
  let candidate = path.join(container, base);
  let index = 2;
  while (fsSync.existsSync(candidate)) {
    candidate = path.join(container, `${base}-${index}`);
    index += 1;
  }
  return candidate;
}

export async function listGitBranches(rootPath: string): Promise<GitBranchSummary[]> {
  const [currentBranch, branchesOutput, remoteOutput, upstreams, worktrees, stashed] =
    await Promise.all([
      runGit(rootPath, ['branch', '--show-current']),
      runGit(rootPath, ['branch', '--format=%(refname:short)']),
      runGit(rootPath, ['branch', '-r', '--format=%(refname:short)']),
      branchUpstreams(rootPath),
      listWorktrees(rootPath).catch(() => [] as ParsedWorktree[]),
      stashedBranches(rootPath),
    ]);
  const current = currentBranch?.trim();
  const localNames = (branchesOutput ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!localNames.length) throw new Error('no local branches found');
  const remoteNames = new Set(
    (remoteOutput ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.includes('->'))
      .map((line) => {
        const slash = line.indexOf('/');
        return slash > 0 ? line.slice(slash + 1) : line;
      })
      .filter(Boolean),
  );
  const seen = new Set<string>();
  const branches: GitBranchSummary[] = [];
  for (const name of localNames) {
    seen.add(name);
    const upstream = upstreams.get(name);
    const counts = upstream ? await divergenceCounts(rootPath, name, upstream) : undefined;
    const ahead = counts?.[0];
    const behind = counts?.[1];
    branches.push({
      name,
      isCurrent: name === current,
      local: true,
      remote: remoteNames.has(name),
      hasStash: (stashed.get(name) ?? 0) > 0,
      stashCount: stashed.get(name) ?? 0,
      upstream,
      ahead,
      behind,
      divergeStatus: divergeStatusFor(ahead, behind),
      worktreePath: worktreeForBranch(worktrees, name),
    });
  }
  for (const name of remoteNames) {
    if (seen.has(name)) continue;
    branches.push({
      name,
      isCurrent: false,
      local: false,
      remote: true,
      hasStash: false,
      upstream: undefined,
      ahead: undefined,
      behind: undefined,
      divergeStatus: undefined,
      worktreePath: undefined,
    });
  }
  branches.sort(
    (left, right) =>
      Number(right.isCurrent) - Number(left.isCurrent) || left.name.localeCompare(right.name),
  );
  return branches;
}

async function runGitRequired(rootPath: string, args: string[]): Promise<string> {
  const output = await runGit(rootPath, args);
  if (typeof output === 'string') return output;
  throw new Error(`git command failed: git ${args.join(' ')}`);
}

function hasLocalGitChanges(snapshot: GitSnapshot): boolean {
  return (
    snapshot.staged.length > 0 || snapshot.unstaged.length > 0 || snapshot.untracked.length > 0
  );
}

async function stashWorkspaceChanges(rootPath: string, branchName: string): Promise<void> {
  await runGitRequired(rootPath, [
    'stash',
    'push',
    '--include-untracked',
    '--message',
    `adl-auto-stash:${branchName}:${Date.now()}`,
  ]);
}

async function findAutoStashRef(rootPath: string, needle: string): Promise<string | undefined> {
  const output = await runGit(rootPath, ['stash', 'list', '--format=%gd %s']);
  if (!output) return undefined;
  let found: string | undefined;
  for (const line of output.split(/\r?\n/)) {
    const space = line.indexOf(' ');
    if (space < 0) continue;
    // 列表按索引升序：保留最后一个命中（与 Rust 端一致，并发新 stash 优先）。
    if (line.slice(space + 1).includes(needle)) found = line.slice(0, space).trim();
  }
  return found || undefined;
}

async function popAutoStash(rootPath: string, branchName: string): Promise<boolean> {
  const needle = `adl-auto-stash:${branchName}:`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ref = await findAutoStashRef(rootPath, needle);
    if (!ref) return true;
    // 校验该索引仍是我们的条目（list 与 pop 之间列表可能被并发改动），
    // 失配重查一次；仍失配按未恢复处理（条目保留，不丢数据）。
    const verify = await findAutoStashRef(rootPath, needle);
    if (verify !== ref) continue;
    const popped = await runGit(rootPath, ['stash', 'pop', '--index', ref]);
    return popped !== undefined;
  }
  return false;
}

async function fetchBranchRef(workPath: string, branchName: string): Promise<string> {
  const remoteRef = await remoteTrackingRef(workPath, branchName);
  if (!remoteRef) throw new Error(`no remote branch found for: ${branchName}`);
  const slash = remoteRef.indexOf('/');
  const remote = slash > 0 ? remoteRef.slice(0, slash) : 'origin';
  await runGitRequired(workPath, ['fetch', remote, branchName]);
  return remoteRef;
}

async function stashGate(
  workPath: string,
  branchName: string,
  allowStash: boolean,
): Promise<boolean> {
  const snapshot = await captureGitSnapshot(workPath);
  if (!snapshot.isRepo) throw new Error('target is not a Git repository');
  const dirty = hasLocalGitChanges(snapshot);
  if (dirty && !allowStash) throw new Error('Dirty worktree requires explicit stash confirmation.');
  if (dirty) await stashWorkspaceChanges(workPath, branchName);
  return dirty;
}

async function resetWorktreeToRemote(
  workPath: string,
  branchName: string,
  allowStash: boolean,
): Promise<boolean> {
  const stashed = await stashGate(workPath, branchName, allowStash);
  const remoteRef = await fetchBranchRef(workPath, branchName);
  await runGitRequired(workPath, ['reset', '--hard', remoteRef]);
  return stashed;
}

async function syncWorktreeWithRemote(
  workPath: string,
  branchName: string,
  allowStash: boolean,
): Promise<boolean> {
  const stashed = await stashGate(workPath, branchName, allowStash);
  const remoteRef = await fetchBranchRef(workPath, branchName);
  const fastForward = await runGit(workPath, ['merge', '--ff-only', remoteRef]);
  if (fastForward !== undefined) return stashed;
  const merged = await runGit(workPath, ['merge', '--no-edit', remoteRef]);
  if (merged === undefined) {
    await runGit(workPath, ['merge', '--abort']);
    throw new Error(
      `sync conflict on ${branchName}: merge aborted, resolve manually in ${remoteRef}`,
    );
  }
  return stashed;
}

function resolveSwitchMode(input: WorkspaceGitBranchSwitchInput): GitSwitchMode {
  return input.mode ?? 'local';
}

export async function ensureBranchWorktree(
  rootPath: string,
  input: WorkspaceWorktreeEnsureInput,
): Promise<WorkspaceWorktreeEnsureResult> {
  const snapshot = await captureGitSnapshot(rootPath);
  if (!snapshot.isRepo) throw new Error('active workspace is not a Git repository');
  const branchName = input.branchName.trim();
  if (!branchName) throw new Error('branch name is required');
  const mode: GitSwitchMode = input.mode ?? 'local';
  await runGit(rootPath, ['worktree', 'prune']);

  const existing = await listWorktrees(rootPath).catch(() => [] as WorktreeInfo[]);
  const reused = existing.find((entry) => entry.branch === branchName)?.path;
  if (reused) {
    if (mode === 'remote') await resetWorktreeToRemote(reused, branchName, input.allowStash);
    if (mode === 'sync') await syncWorktreeWithRemote(reused, branchName, input.allowStash);
    return {
      path: reused,
      created: false,
      branch: branchName,
      gitSnapshot: await captureGitSnapshot(reused),
    };
  }

  const local = await hasLocalBranch(rootPath, branchName);
  const remoteRef = await remoteTrackingRef(rootPath, branchName);
  if (!local && !remoteRef)
    throw new Error(`branch not found locally or on remotes: ${branchName}`);
  if (mode === 'remote' && !remoteRef)
    throw new Error(`no remote branch to reset from: ${branchName}`);

  const target = siblingWorktreeDir(rootPath, branchName);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const addArgs =
    mode === 'remote' && remoteRef
      ? ['worktree', 'add', '-B', branchName, target, remoteRef]
      : local
        ? ['worktree', 'add', target, branchName]
        : ['worktree', 'add', '-b', branchName, target, remoteRef!];
  const added = await runGit(rootPath, addArgs);
  let finalPath = target;
  const created = added !== undefined;
  if (!created) {
    const relisted = await listWorktrees(rootPath).catch(() => [] as WorktreeInfo[]);
    const raced = relisted.find((entry) => entry.branch === branchName)?.path;
    if (!raced) throw new Error(`git command failed: git ${addArgs.join(' ')}`);
    finalPath = raced;
  }
  // 本轮新建的目录若在应用模式时失败（典型：离线 fetch 不通），回滚删掉；
  // 只删自己建的，不碰旧的。
  try {
    if (mode === 'remote') await resetWorktreeToRemote(finalPath, branchName, input.allowStash);
    if (mode === 'sync') await syncWorktreeWithRemote(finalPath, branchName, input.allowStash);
  } catch (error) {
    if (created) {
      await removeBranchWorktree(rootPath, { branchName, force: true }).catch(() => {});
      await pruneWorktrees(rootPath).catch(() => {});
    }
    throw error;
  }
  return {
    path: finalPath,
    created,
    branch: branchName,
    gitSnapshot: await captureGitSnapshot(finalPath),
  };
}

export async function removeBranchWorktree(
  rootPath: string,
  input: WorkspaceWorktreeRemoveInput,
): Promise<void> {
  const branchName = input.branchName.trim();
  if (!branchName) throw new Error('branch name is required');
  const worktrees = await listWorktrees(rootPath);
  const target = worktrees.find((entry) => entry.branch === branchName)?.path;
  if (!target) throw new Error(`no worktree found for branch: ${branchName}`);
  if (worktrees.length > 0 && worktrees[0].path === target) {
    throw new Error('cannot remove the main worktree; remove the sibling directory instead');
  }
  const args = input.force
    ? ['worktree', 'remove', '--force', target]
    : ['worktree', 'remove', target];
  await runGitRequired(rootPath, args);
}

export async function pruneWorktrees(rootPath: string): Promise<void> {
  await runGitRequired(rootPath, ['worktree', 'prune']);
}

async function updateWorkspaceMetaForBranchChange(
  rootPath: string,
): Promise<import('../src/kernel/index').WorkspaceMeta> {
  const root = await detectWorkspaceRoot(rootPath);
  const currentTime = nowMs();
  return {
    id: createWorkspaceId(root),
    path: root,
    rootPath: root,
    name: path.basename(root) || root,
    type: await inferWorkspaceType(root),
    status: 'ready',
    gitSnapshot: await captureGitSnapshot(root),
    createdAt: currentTime,
    updatedAt: currentTime,
    lastOpenedAt: currentTime,
  };
}

export async function switchGitBranch(
  rootPath: string,
  input: WorkspaceGitBranchSwitchInput,
): Promise<import('../src/kernel/index').WorkspaceGitBranchChangeResult> {
  const snapshot = await captureGitSnapshot(rootPath);
  if (!snapshot.isRepo) throw new Error('active workspace is not a Git repository');
  const branchName = input.branchName.trim();
  if (!branchName) throw new Error('branch name is required');
  const mode = resolveSwitchMode(input);
  const stashedChanges = hasLocalGitChanges(snapshot);
  if (stashedChanges && !input.allowStash)
    throw new Error('Dirty worktree requires explicit stash confirmation.');
  if (stashedChanges) await stashWorkspaceChanges(rootPath, snapshot.branch ?? branchName);
  await runGitRequired(rootPath, ['switch', branchName]);
  if (mode === 'remote') await resetWorktreeToRemote(rootPath, branchName, true);
  if (mode === 'sync') await syncWorktreeWithRemote(rootPath, branchName, true);
  const hasRestored = await popAutoStash(rootPath, branchName);
  const workspace = await updateWorkspaceMetaForBranchChange(rootPath);
  return {
    workspace,
    gitSnapshot: workspace.gitSnapshot!,
    previousBranch: snapshot.branch,
    currentBranch: workspace.gitSnapshot?.branch ?? branchName,
    stashedChanges,
    hasRestored,
  };
}

export async function createGitBranch(
  rootPath: string,
  input: WorkspaceGitBranchCreateInput,
): Promise<import('../src/kernel/index').WorkspaceGitBranchChangeResult> {
  const snapshot = await captureGitSnapshot(rootPath);
  if (!snapshot.isRepo) throw new Error('active workspace is not a Git repository');
  const branchName = input.branchName.trim();
  if (!branchName) throw new Error('branch name is required');
  const currentBranch = snapshot.branch;
  if (!currentBranch) throw new Error('failed to resolve current branch');
  const baseBranch = input.baseBranch?.trim() || currentBranch;
  const stashedChanges = baseBranch !== currentBranch && hasLocalGitChanges(snapshot);
  if (stashedChanges && !input.allowStash)
    throw new Error('Dirty worktree requires explicit stash confirmation.');
  if (stashedChanges) await stashWorkspaceChanges(rootPath, currentBranch);
  if (baseBranch !== currentBranch) await runGitRequired(rootPath, ['switch', baseBranch]);
  await runGitRequired(rootPath, ['switch', '-c', branchName]);
  const workspace = await updateWorkspaceMetaForBranchChange(rootPath);
  return {
    workspace,
    gitSnapshot: workspace.gitSnapshot!,
    previousBranch: snapshot.branch,
    currentBranch: workspace.gitSnapshot?.branch ?? branchName,
    stashedChanges,
    hasRestored: false,
  };
}
