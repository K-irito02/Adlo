import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import path from 'node:path';
import type { IpcResult, GitBranchSummary } from '../../src/kernel/index';
import * as git from './git';
import * as files from './files';
import * as search from './search';
import * as ciModule from './ci';
import * as logging from './logging';
import * as gitVis from './gitVisualization';
import * as siteMetaCache from './siteMetaCache';

export { git, files, search, ciModule as ci, logging };
export * from './git';
export * from './files';
export * from './search';

export * from './logging';
export * from './mcp';

const API_PREFIX = '/__adl_preview_api__';

let ciAccessToken: string = '';

const WIN_SYSTEM_DIRS =
  process.platform === 'win32'
    ? ['C:\\Windows\\System32', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0', 'C:\\Windows\\SysWOW64', 'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0', 'C:\\Windows']
    : [];

const CSC_CANDIDATE_PATHS =
  process.platform === 'win32'
    ? ['C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe', 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe']
    : [];

const PICKER_CS_PATH = path.join(__dirname, '..', 'picker', 'FolderPicker.cs');

export function isPreviewWorkspaceApiRequest(url: string | undefined): boolean {
  return Boolean(url && url.startsWith(API_PREFIX));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function writeJson(response: ServerResponse, payload: IpcResult<unknown>) {
  response.statusCode = payload.ok ? 200 : 400;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(message: string, code = 'PREVIEW_WORKSPACE_ERROR'): IpcResult<never> {
  return { ok: false, error: { code, message } };
}

// --- Platform-specific operations ---

async function resolveWindowsBinary(name: string): Promise<string> {
  const probe = (cmd: string): Promise<boolean> =>
    new Promise((resolve) => {
      const child = spawn(cmd, ['//?//'], { windowsHide: true, stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('close', () => resolve(true));
    });
  if (await probe(name)) return name;
  for (const dir of WIN_SYSTEM_DIRS) {
    const fullPath = path.join(dir, name);
    if (fsSync.existsSync(fullPath) && (await probe(fullPath))) return fullPath;
  }
  return name;
}

let compiledPickerExe: string | undefined;

async function compileFolderPicker(): Promise<string | undefined> {
  if (compiledPickerExe && fsSync.existsSync(compiledPickerExe)) return compiledPickerExe;
  if (!fsSync.existsSync(PICKER_CS_PATH)) return undefined;
  const outputExe = PICKER_CS_PATH.replace(/\.cs$/, '.exe');
  for (const csc of CSC_CANDIDATE_PATHS) {
    if (!fsSync.existsSync(csc)) continue;
    const success = await new Promise<boolean>((resolve) => {
      const child = spawn(csc, ['/nologo', '/target:exe', `/out:${outputExe}`, PICKER_CS_PATH], { windowsHide: true });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
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
    const child = spawn(exe, [], { windowsHide: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('error', () => resolve(undefined));
    child.on('close', (code) => {
      const selected = stdout.trim();
      resolve(code === 0 && selected ? selected : undefined);
    });
  });
}

async function runFolderPickerPowerShell(): Promise<string | undefined> {
  const psPath = await resolveWindowsBinary('powershell.exe');
  const psScript = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$d.Description = "Select workspace folder"',
    '$d.ShowNewFolderButton = $true',
    'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  [Console]::Write($d.SelectedPath)',
    '}',
  ].join('; ');
  return new Promise((resolve) => {
    const child = spawn(psPath, ['-NoProfile', '-Sta', '-Command', psScript], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('error', () => resolve(undefined));
    child.on('close', () => {
      const selected = stdout.trim();
      resolve(selected || undefined);
    });
  });
}

async function pickDirectory(): Promise<string | undefined> {
  if (process.platform === 'win32') {
    const exe = await compileFolderPicker();
    if (exe) return runFolderPickerCsharp(exe);
    return runFolderPickerPowerShell();
  }
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      const child = spawn('osascript', ['-e', 'set chosenFolder to choose folder with prompt "Select workspace folder"', '-e', 'POSIX path of chosenFolder'], { windowsHide: true });
      let stdout = '';
      child.stdout.on('data', (chunk) => { stdout += String(chunk); });
      child.on('error', () => resolve(undefined));
      child.on('close', (code) => {
        if (code !== 0) { resolve(undefined); return; }
        resolve(stdout.trim() || undefined);
      });
    });
  }
  return new Promise((resolve) => {
    const child = spawn('zenity', ['--file-selection', '--directory', '--title=Select workspace folder'], { windowsHide: true });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('error', () => resolve(undefined));
    child.on('close', (code) => {
      if (code !== 0) { resolve(undefined); return; }
      resolve(stdout.trim() || undefined);
    });
  });
}

async function revealInFileManager(targetPath: string): Promise<boolean> {
  const normalizedPath = process.platform === 'win32' ? targetPath.replace(/\//g, '\\') : targetPath;
  const absolutePath = path.resolve(normalizedPath);
  if (!fsSync.existsSync(absolutePath)) throw new Error(`path does not exist: ${targetPath}`);
  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('cmd.exe', ['/c', 'start', '', 'explorer', `/select,${absolutePath}`], { windowsHide: false, detached: true, shell: false });
      child.on('error', reject);
      child.on('spawn', () => resolve());
    });
    return true;
  }
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, [absolutePath], { windowsHide: true });
    child.on('error', reject);
    child.on('spawn', () => resolve());
  });
  return true;
}

// --- Route table ---

interface Route {
  method: string;
  pathname: string;
  handler: (request: IncomingMessage, body: unknown, searchParams: URLSearchParams) => Promise<IpcResult<unknown>>;
}

function makePath(relativePath: string): string {
  return `${API_PREFIX}${relativePath}`;
}

function extractHeaderToken(request: IncomingMessage): string {
  const headers = request.headers;
  const rawToken = typeof headers.get === 'function'
    ? (headers.get('x-ci-access-token') ?? headers.get('X-CI-Access-Token'))
    : Array.isArray(headers['x-ci-access-token'])
      ? headers['x-ci-access-token'][0]
      : headers['x-ci-access-token'];
  return (rawToken as string) ?? '';
}

const routes: Route[] = [
  {
    method: 'POST', pathname: makePath('/workspace/open'),
    handler: async (_req, body) => {
      const b = body as { workspacePath?: string } | undefined;
      if (!b?.workspacePath?.trim()) return fail('workspacePath is required', 'INVALID_INPUT');
      return ok(await files.openWorkspace(b.workspacePath.trim()));
    },
  },
  {
    method: 'POST', pathname: makePath('/workspace/pick-directory'),
    handler: async () => ok(await pickDirectory()),
  },
  {
    method: 'POST', pathname: makePath('/workspace/reveal'),
    handler: async (_req, body) => {
      const b = body as { path?: string } | undefined;
      if (!b?.path?.trim()) return fail('path is required', 'INVALID_INPUT');
      return ok(await revealInFileManager(b.path.trim()));
    },
  },
  {
    method: 'POST', pathname: makePath('/workspace/write-debug-logs'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; content?: string; mode?: 'overwrite' | 'append' | 'multi' } | undefined;
      if (!b?.rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      return ok(await logging.writeDebugLogs(b.rootPath.trim(), b.content ?? '', b.mode ?? 'overwrite'));
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/app-directory'),
    handler: async () => {
      const appDirectory = path.resolve(process.cwd(), '../../');
      return ok(appDirectory);
    },
  },
  {
    method: 'POST', pathname: makePath('/workspace/create-file'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; relativePath?: string; content?: string } | undefined;
      if (!b?.rootPath?.trim() || !b?.relativePath?.trim()) return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.createFile(b.rootPath.trim(), b.relativePath.trim(), b.content ?? ''));
    },
  },
  {
    method: 'POST', pathname: makePath('/workspace/create-folder'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; relativePath?: string } | undefined;
      if (!b?.rootPath?.trim() || !b?.relativePath?.trim()) return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.createFolder(b.rootPath.trim(), b.relativePath.trim()));
    },
  },
  {
    method: 'POST', pathname: makePath('/workspace/rename-file'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; relativePath?: string; newName?: string } | undefined;
      if (!b?.rootPath?.trim() || !b?.relativePath?.trim() || !b?.newName?.trim()) return fail('rootPath, relativePath, and newName are required', 'INVALID_INPUT');
      return ok(await files.renameFile(b.rootPath.trim(), b.relativePath.trim(), b.newName.trim()));
    },
  },
  {
    method: 'POST', pathname: makePath('/workspace/delete-file'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; relativePath?: string } | undefined;
      if (!b?.rootPath?.trim() || !b?.relativePath?.trim()) return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.deleteFileEntry(b.rootPath.trim(), b.relativePath.trim()));
    },
  },
  {
    method: 'POST', pathname: makePath('/workspace/duplicate-file'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; srcRelativePath?: string; dstRelativePath?: string } | undefined;
      if (!b?.rootPath?.trim() || !b?.srcRelativePath?.trim() || !b?.dstRelativePath?.trim()) return fail('rootPath, srcRelativePath, and dstRelativePath are required', 'INVALID_INPUT');
      return ok(await files.duplicateFile(b.rootPath.trim(), b.srcRelativePath.trim(), b.dstRelativePath.trim()));
    },
  },
  {
    method: 'POST', pathname: makePath('/workspace/move-file'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; relativePath?: string; newPath?: string } | undefined;
      if (!b?.rootPath?.trim() || !b?.relativePath?.trim() || !b?.newPath?.trim()) return fail('rootPath, relativePath, and newPath are required', 'INVALID_INPUT');
      return ok(await files.moveFile(b.rootPath.trim(), b.relativePath.trim(), b.newPath.trim()));
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/tree'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      return ok(await files.listTree(rootPath));
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/file'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const relativePath = searchParams.get('relativePath');
      if (!rootPath?.trim() || !relativePath?.trim()) return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.readFile(rootPath, relativePath));
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/change-preview'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const relativePath = searchParams.get('relativePath');
      if (!rootPath?.trim() || !relativePath?.trim()) return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await git.readChangePreview(rootPath, relativePath));
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/search'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const query = searchParams.get('query') ?? '';
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      return ok(await search.searchText(rootPath, query));
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/outline'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const relativePath = searchParams.get('relativePath');
      if (!rootPath?.trim() || !relativePath?.trim()) return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.outline(rootPath, relativePath));
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/git-status'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      return ok(await git.captureGitSnapshot(rootPath));
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/git-branches'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      try {
        return ok(await git.listGitBranches(rootPath));
      } catch {
        return ok<GitBranchSummary[]>([]);
      }
    },
  },
  {
    method: 'POST', pathname: makePath('/workspace/git-switch'),
    handler: async (_req, body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      const input = body as Record<string, unknown> | undefined;
      if (!input) return fail('branch switch payload is required', 'INVALID_INPUT');
      return ok(await git.switchGitBranch(rootPath, input as any));
    },
  },
  {
    method: 'POST', pathname: makePath('/workspace/git-create-branch'),
    handler: async (_req, body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      const input = body as Record<string, unknown> | undefined;
      if (!input) return fail('branch creation payload is required', 'INVALID_INPUT');
      return ok(await git.createGitBranch(rootPath, input as any));
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/absolute-path'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const relativePath = searchParams.get('relativePath');
      if (!rootPath?.trim() || !relativePath?.trim()) return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.getAbsolutePath(rootPath, relativePath));
    },
  },
  {
    method: 'GET', pathname: makePath('/retrieval/status'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const workspaceId = searchParams.get('workspaceId') ?? files.createWorkspaceId(rootPath ?? '');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      return ok(await files.buildRetrievalSnapshot(workspaceId, rootPath));
    },
  },
  {
    method: 'GET', pathname: makePath('/ci/status'),
    handler: async (req, _body, searchParams) => {
      const owner = searchParams.get('owner') ?? '';
      const repo = searchParams.get('repo') ?? '';
      const branch = searchParams.get('branch') ?? 'main';
      if (!owner.trim() || !repo.trim()) return fail('owner and repo are required', 'INVALID_INPUT');
      const token = extractHeaderToken(req);
      const snapshot = await ciModule.fetchCiStatus(owner, repo, branch, token || ciAccessToken);
      if (snapshot.error) return fail(snapshot.error, 'GITHUB_API_ERROR');
      return ok(snapshot);
    },
  },
  {
    method: 'GET', pathname: makePath('/ci/has-access-token'),
    handler: async () => ok(ciAccessToken.length > 0),
  },
  {
    method: 'POST', pathname: makePath('/ci/set-access-token'),
    handler: async (_req, body) => {
      const b = body as { token?: string } | undefined;
      ciAccessToken = typeof b?.token === 'string' ? b.token.trim() : '';
      return ok(true);
    },
  },
  {
    method: 'POST', pathname: makePath('/ci/clear-access-token'),
    handler: async () => {
      ciAccessToken = '';
      return ok(true);
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/git-vis-commit-stats'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const since = searchParams.get('since') ?? undefined;
      const until = searchParams.get('until') ?? undefined;
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      const data = await gitVis.handleCommitStats(rootPath, since, until);
      return ok(data);
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/git-vis-code-evolution'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const since = searchParams.get('since') ?? undefined;
      const until = searchParams.get('until') ?? undefined;
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      const data = await gitVis.handleCodeEvolution(rootPath, since, until);
      return ok(data);
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/git-vis-contributor-modules'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const since = searchParams.get('since') ?? undefined;
      const until = searchParams.get('until') ?? undefined;
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      const data = await gitVis.handleContributorModules(rootPath, since, until);
      return ok(data);
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/git-vis-branch-graph'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      const data = await gitVis.handleBranchGraph(rootPath);
      return ok(data);
    },
  },
  {
    method: 'GET', pathname: makePath('/workspace/git-vis-file-hotspots'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const since = searchParams.get('since') ?? undefined;
      const until = searchParams.get('until') ?? undefined;
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      const data = await gitVis.handleFileHotspots(rootPath, since, until);
      return ok(data);
    },
  },
  {
    method: 'GET', pathname: makePath('/browser/site-meta-cache'),
    handler: async (_req, _body, searchParams) => {
      const baseDir = searchParams.get('baseDir') ?? process.cwd();
      return ok(await siteMetaCache.readSiteMetaCache(baseDir));
    },
  },
  {
    method: 'PUT', pathname: makePath('/browser/site-meta-cache'),
    handler: async (_req, body) => {
      const b = body as { baseDir?: string; entries?: Record<string, siteMetaCache.SiteMetaCacheEntry> } | undefined;
      if (!b?.entries) return fail('entries required', 'INVALID_INPUT');
      const baseDir = b.baseDir ?? process.cwd();
      await siteMetaCache.writeSiteMetaCache(baseDir, b.entries);
      return ok(true);
    },
  },
  {
    method: 'DELETE', pathname: makePath('/browser/site-meta-cache'),
    handler: async (_req, body) => {
      const b = body as { baseDir?: string; urls?: string[]; clearAll?: boolean } | undefined;
      const baseDir = b?.baseDir ?? process.cwd();
      const current = await siteMetaCache.readSiteMetaCache(baseDir);
      if (b?.clearAll) {
        await siteMetaCache.writeSiteMetaCache(baseDir, {});
        return ok(true);
      }
      for (const url of b?.urls ?? []) delete current[url];
      await siteMetaCache.writeSiteMetaCache(baseDir, current);
      return ok(true);
    },
  },
];

export async function handlePreviewWorkspaceApi(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  const requestUrl = new URL(request.url ?? API_PREFIX, 'http://127.0.0.1');
  if (!isPreviewWorkspaceApiRequest(requestUrl.pathname)) return false;

  try {
    const route = routes.find((r) => r.method === request.method && requestUrl.pathname === r.pathname);
    if (!route) {
      writeJson(response, fail('unsupported preview workspace route', 'NOT_FOUND'));
      return true;
    }

    let body: unknown = undefined;
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
      body = await readBody(request);
    }

    const result = await route.handler(request, body, requestUrl.searchParams);
    writeJson(response, result);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson(response, fail(message));
    return true;
  }
}
