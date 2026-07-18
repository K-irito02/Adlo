import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { GitSnapshot, GitBranchSummary, WorkspaceGitBranchSwitchInput, WorkspaceGitBranchCreateInput, WorkspaceChangePreview } from '../../src/kernel/index';
import { resolveWorkspacePath, normalizePath, relativePath, detectWorkspaceRoot, inferWorkspaceType, createWorkspaceId, nowMs, DEFAULT_MAX_FILE_BYTES } from './files';

const GIT_TIMEOUT_MS = 30_000;
const GIT_CANDIDATE_PATHS = process.platform === 'win32'
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

async function runGit(rootPath: string, args: string[]): Promise<string | undefined> {
  const gitBin = await resolveGitBinary();
  return new Promise((resolve) => {
    const child = spawn(gitBin, args, { cwd: rootPath, windowsHide: true });
    let stdout = '';
    let timer: NodeJS.Timeout | undefined;
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('error', () => { if (timer) clearTimeout(timer); resolve(undefined); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve(code === 0 ? stdout.trim() : undefined); });
    timer = setTimeout(() => { child.kill(); resolve(undefined); }, GIT_TIMEOUT_MS);
  });
}

async function runGitBytes(rootPath: string, args: string[]): Promise<Buffer | undefined> {
  const gitBin = await resolveGitBinary();
  return new Promise((resolve) => {
    const child = spawn(gitBin, args, { cwd: rootPath, windowsHide: true });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); });
    child.on('error', () => resolve(undefined));
    child.on('close', (code) => resolve(code === 0 ? Buffer.concat(chunks) : undefined));
  });
}

async function runGitNullSeparated(rootPath: string, args: string[]): Promise<string[]> {
  const stdout = await runGitBytes(rootPath, args);
  if (!stdout) return [];
  return stdout.toString('utf8').split('\0').filter((value) => value.length > 0).map((value) => normalizePath(value));
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
    isRepo: Boolean(branch || head),
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

async function gitHeadFileExists(rootPath: string, relativeTarget: string): Promise<boolean> {
  const gitBin = await resolveGitBinary();
  return new Promise((resolve) => {
    const child = spawn(gitBin, ['cat-file', '-e', `HEAD:${normalizePath(relativeTarget)}`], { cwd: rootPath, windowsHide: true });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function gitShowFile(rootPath: string, relativeTarget: string): Promise<string | undefined> {
  const stdout = await runGitBytes(rootPath, ['show', `HEAD:${normalizePath(relativeTarget)}`]);
  if (stdout && stdout.byteLength > DEFAULT_MAX_FILE_BYTES) {
    throw new Error(`git blob is too large to preview: ${normalizePath(relativeTarget)}`);
  }
  return stdout ? stdout.toString('utf8') : undefined;
}

export async function readChangePreview(rootPath: string, relativeTarget: string): Promise<WorkspaceChangePreview> {
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
  if (stats?.isDirectory()) throw new Error(`change preview requires a file path: ${normalizedTarget}`);

  const currentExists = stats?.isFile() ?? false;
  const currentContent = currentExists ? await fs.readFile(absolutePath, 'utf8') : '';
  const baseContent = await gitShowFile(rootPath, normalizedTarget);
  const baseExists = typeof baseContent === 'string' ? true : await gitHeadFileExists(rootPath, normalizedTarget);

  if (!baseExists && !currentExists) throw new Error(`change preview source is unavailable: ${normalizedTarget}`);

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

export async function listGitBranches(rootPath: string): Promise<GitBranchSummary[]> {
  const [currentBranch, branchesOutput] = await Promise.all([
    runGit(rootPath, ['branch', '--show-current']),
    runGit(rootPath, ['branch', '--format=%(refname:short)']),
  ]);
  const current = currentBranch?.trim();
  const branches = (branchesOutput ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name, isCurrent: name === current }));
  if (!branches.length) throw new Error('no local branches found');
  branches.sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent) || left.name.localeCompare(right.name));
  return branches;
}

async function runGitRequired(rootPath: string, args: string[]): Promise<string> {
  const output = await runGit(rootPath, args);
  if (typeof output === 'string') return output;
  throw new Error(`git command failed: git ${args.join(' ')}`);
}

function hasLocalGitChanges(snapshot: GitSnapshot): boolean {
  return snapshot.staged.length > 0 || snapshot.unstaged.length > 0 || snapshot.untracked.length > 0;
}

async function stashWorkspaceChanges(rootPath: string): Promise<void> {
  await runGitRequired(rootPath, ['stash', 'push', '--include-untracked', '--message', `adl-preview-auto-stash-${Date.now()}`]);
}

async function updateWorkspaceMetaForBranchChange(rootPath: string): Promise<import('../src/kernel/index').WorkspaceMeta> {
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

export async function switchGitBranch(rootPath: string, input: WorkspaceGitBranchSwitchInput): Promise<import('../src/kernel/index').WorkspaceGitBranchChangeResult> {
  const snapshot = await captureGitSnapshot(rootPath);
  if (!snapshot.isRepo) throw new Error('active workspace is not a Git repository');
  const branchName = input.branchName.trim();
  if (!branchName) throw new Error('branchName is required');
  const stashedChanges = hasLocalGitChanges(snapshot);
  if (stashedChanges && !input.allowStash) throw new Error('Dirty worktree requires explicit stash confirmation.');
  if (stashedChanges) await stashWorkspaceChanges(rootPath);
  await runGitRequired(rootPath, ['switch', branchName]);
  const workspace = await updateWorkspaceMetaForBranchChange(rootPath);
  return {
    workspace,
    gitSnapshot: workspace.gitSnapshot!,
    previousBranch: snapshot.branch,
    currentBranch: workspace.gitSnapshot?.branch ?? branchName,
    stashedChanges,
  };
}

export async function createGitBranch(rootPath: string, input: WorkspaceGitBranchCreateInput): Promise<import('../src/kernel/index').WorkspaceGitBranchChangeResult> {
  const snapshot = await captureGitSnapshot(rootPath);
  if (!snapshot.isRepo) throw new Error('active workspace is not a Git repository');
  const branchName = input.branchName.trim();
  if (!branchName) throw new Error('branchName is required');
  const currentBranch = snapshot.branch;
  if (!currentBranch) throw new Error('failed to resolve current branch');
  const baseBranch = input.baseBranch?.trim() || currentBranch;
  const stashedChanges = baseBranch !== currentBranch && hasLocalGitChanges(snapshot);
  if (stashedChanges && !input.allowStash) throw new Error('Dirty worktree requires explicit stash confirmation.');
  if (stashedChanges) await stashWorkspaceChanges(rootPath);
  if (baseBranch !== currentBranch) await runGitRequired(rootPath, ['switch', baseBranch]);
  await runGitRequired(rootPath, ['switch', '-c', branchName]);
  const workspace = await updateWorkspaceMetaForBranchChange(rootPath);
  return {
    workspace,
    gitSnapshot: workspace.gitSnapshot!,
    previousBranch: snapshot.branch,
    currentBranch: workspace.gitSnapshot?.branch ?? branchName,
    stashedChanges,
  };
}
