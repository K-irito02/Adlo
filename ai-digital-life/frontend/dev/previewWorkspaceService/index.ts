import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IpcResult, GitBranchSummary } from '../../src/kernel/index';
import * as git from './git';
import * as files from './files';
import * as search from './search';
import * as ciModule from './ci';
import * as logging from './logging';
import * as gitVis from './gitVisualization';
import * as siteMetaCache from './siteMetaCache';
import { workspaceWatchers } from './workspaceWatcher';
import { createPreviewPageMetaService } from './pageMetaService';
import type { MetaSource } from '../../src/shared/ipc/browser';

export { git, files, search, ciModule as ci, logging };
export * from './git';
export * from './files';
export * from './search';

export * from './logging';
export * from './mcp';

const API_PREFIX = '/__adl_preview_api__';

let ciAccessToken: string = '';

// 预览模式 PageMeta 服务单例（baseDir 与既有 site-meta-cache 路由的默认一致）。
// Vite HMR 时复用既有实例，避免热更新导致状态丢失（内存缓存、单飞行、持久化队列）。
let pageMetaSvc = createPreviewPageMetaService({ baseDir: process.cwd() });
if (typeof import.meta !== 'undefined' && import.meta.hot && import.meta.hot.data) {
  if (import.meta.hot.data.pageMetaServiceInstance) {
    pageMetaSvc = import.meta.hot.data.pageMetaServiceInstance;
  }
  import.meta.hot.dispose(() => {
    import.meta.hot.data.pageMetaServiceInstance = pageMetaSvc;
  });
}

const WIN_SYSTEM_DIRS =
  process.platform === 'win32'
    ? [
        'C:\\Windows\\System32',
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
        'C:\\Windows\\SysWOW64',
        'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0',
        'C:\\Windows',
      ]
    : [];

const CSC_CANDIDATE_PATHS =
  process.platform === 'win32'
    ? [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
      ]
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

export async function putSiteMetaCacheRoute(body: unknown): Promise<IpcResult<boolean>> {
  const b = body as { baseDir?: string; entries?: unknown } | undefined;
  if (!b?.entries || typeof b.entries !== 'object' || Array.isArray(b.entries)) {
    return fail('entries required', 'INVALID_INPUT');
  }
  if (b.baseDir !== undefined && typeof b.baseDir !== 'string') {
    return fail('baseDir must be a string', 'INVALID_INPUT');
  }
  const baseDir = b.baseDir ?? process.cwd();
  await siteMetaCache.upsertSiteMetaCache(
    baseDir,
    b.entries as Record<string, siteMetaCache.SiteMetaCacheEntry>,
  );
  return ok(true);
}

export async function deleteSiteMetaCacheRoute(body: unknown): Promise<IpcResult<boolean>> {
  const b = body as { baseDir?: string; urls?: unknown; clearAll?: boolean } | undefined;
  if (b?.urls !== undefined && !Array.isArray(b.urls)) {
    return fail('urls must be an array', 'INVALID_INPUT');
  }
  if (b?.baseDir !== undefined && typeof b.baseDir !== 'string') {
    return fail('baseDir must be a string', 'INVALID_INPUT');
  }
  const baseDir = b?.baseDir ?? process.cwd();
  if (b?.clearAll) {
    await siteMetaCache.writeSiteMetaCache(baseDir, {});
    return ok(true);
  }
  const urls = (b?.urls ?? []) as string[];
  if (urls.length === 0) {
    return ok(true);
  }
  const current = await siteMetaCache.readSiteMetaCache(baseDir);
  let changed = false;
  for (const url of urls) {
    if (Object.hasOwn(current, url)) {
      delete current[url];
      changed = true;
    }
  }
  if (changed) {
    await siteMetaCache.writeSiteMetaCache(baseDir, current);
  }
  return ok(true);
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
      const child = spawn(csc, ['/nologo', '/target:exe', `/out:${outputExe}`, PICKER_CS_PATH], {
        windowsHide: true,
      });
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
    const child = spawn(exe, [], {
      windowsHide: true,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
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
    const child = spawn(psPath, ['-NoProfile', '-Sta', '-Command', psScript], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
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
      const child = spawn(
        'osascript',
        [
          '-e',
          'set chosenFolder to choose folder with prompt "Select workspace folder"',
          '-e',
          'POSIX path of chosenFolder',
        ],
        { windowsHide: true },
      );
      let stdout = '';
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.on('error', () => resolve(undefined));
      child.on('close', (code) => {
        if (code !== 0) {
          resolve(undefined);
          return;
        }
        resolve(stdout.trim() || undefined);
      });
    });
  }
  return new Promise((resolve) => {
    const child = spawn(
      'zenity',
      ['--file-selection', '--directory', '--title=Select workspace folder'],
      { windowsHide: true },
    );
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.on('error', () => resolve(undefined));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(undefined);
        return;
      }
      resolve(stdout.trim() || undefined);
    });
  });
}

/**
 * 预填文件名收敛为纯基名（与 Rust `sanitize_suggested_name` 同语义）：
 * 剥掉目录成分、非法字符换下划线、空白兜底为 `clipboard`。
 */
function sanitizeSuggestedName(raw: string): string {
  const base = path.basename(raw.trim().replace(/\\/g, '/'));
  const cleaned = base.replace(/[\0/\\:*?"<>|]/g, '_').trim();
  return cleaned || 'clipboard';
}

/** 从预填名推导小写扩展名；无扩展名返回空串（不挂类型过滤器）。 * 仅保留字母数字（与 Rust `filter_extensions` 的保守策略对齐）：扩展名会被拼进
 * PowerShell 双引号 Filter，直接放行 `$()`/反引号即命令注入。html 兼容 htm 别名。 */
function extensionOf(fileName: string): string {
  const ext = path.extname(fileName).replace(/^\./, '').toLowerCase();
  if (ext === 'htm') return 'html';
  if (ext === 'html') return ext;
  return ext.replace(/[^a-z0-9]+/g, '');
}

function runCaptured(
  cmd: string,
  args: string[],
  windowsHide: boolean,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.on('error', () => resolve(undefined));
    child.on('close', (code) => {
      const picked = stdout.trim();
      resolve(code === 0 && picked ? picked : undefined);
    });
  });
}

/**
 * 标准 base64 载荷校验（与桌面端 Rust `STANDARD.decode` 的拒绝语义对齐）。
 * Node 的 `Buffer.from(x, 'base64')` 从不因非法输入抛错（静默丢弃非法字符），
 * 不校验就会把畸形载荷落盘成垃圾/空文件，而桌面端返回 InvalidInput。
 */
export function isValidBase64Payload(value: string): boolean {
  if (value === '') return false;
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

/**
 * 系统原生「另存为」对话框 —— 浏览器预览端的落盘通道，
 * 与桌面端 `clipboard_save_to_file` 命令行为一致（预填文件名、可改名改位置、
 * 覆盖确认、取消返回 undefined）。
 */
async function pickSavePath(suggestedName: string): Promise<string | undefined> {
  const fileName = sanitizeSuggestedName(suggestedName);
  const ext = extensionOf(fileName);
  if (process.platform === 'win32') {
    // 预填名走 base64 传参：WinForms 脚本内是字符串拼接，裸传会被引号/反引号打断。
    const b64 = Buffer.from(fileName, 'utf8').toString('base64');
    const psScript = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      `$name = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'));`,
      '$d = New-Object System.Windows.Forms.SaveFileDialog;',
      '$d.FileName = $name;',
      // 与 Rust 侧双别名对齐：html 挂 [htm, html] 双 pattern（`;` 分隔）。
      ext === 'html'
        ? '$d.Filter = "html|*.htm;*.html|All files|*.*";'
        : ext
          ? `$d.Filter = "${ext}|*.${ext}|All files|*.*";`
          : '$d.Filter = "All files|*.*";',
      '$d.OverwritePrompt = $true;',
      'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($d.FileName) }',
    ].join('; ');
    const psPath = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe';
    return runCaptured(psPath, ['-NoProfile', '-Sta', '-Command', psScript], true);
  }
  if (process.platform === 'darwin') {
    // 预填名走 argv（非 shell），避免引号注入。
    return runCaptured(
      'osascript',
      [
        '-e',
        'on run argv',
        '-e',
        'POSIX path of (choose file name with default name (item 1 of argv))',
        '-e',
        'end run',
        fileName,
      ],
      true,
    );
  }
  const zenityArgs = ['--file-selection', '--save', '--confirm-overwrite'];
  // 与 Rust 侧双别名对齐：html 挂 [htm, html] 双 pattern（空格分隔）。
  if (ext === 'html') zenityArgs.push('--file-filter=html | html files | *.htm *.html');
  else if (ext) zenityArgs.push(`--file-filter=${ext} | ${ext} files | *.${ext}`);
  zenityArgs.push(`--filename=${fileName}`);
  return runCaptured('zenity', zenityArgs, true);
}

async function revealInFileManager(targetPath: string): Promise<boolean> {
  const normalizedPath =
    process.platform === 'win32' ? targetPath.replace(/\//g, '\\') : targetPath;
  const absolutePath = path.resolve(normalizedPath);
  if (!fsSync.existsSync(absolutePath)) throw new Error(`path does not exist: ${targetPath}`);
  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('cmd.exe', ['/c', 'start', '', 'explorer', `/select,${absolutePath}`], {
        windowsHide: false,
        detached: true,
        shell: false,
      });
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
  handler: (
    request: IncomingMessage,
    body: unknown,
    searchParams: URLSearchParams,
  ) => Promise<IpcResult<unknown>>;
}

/**
 * 从查询串解析检索分页窗口；缺省由 `normalizeSearchWindow` 兜底。
 * 预览服务的 GET 检索把窗口放在 query 上（POST 走 body）。
 */
function parseWindow(searchParams: URLSearchParams): { offset?: number; limit?: number } {
  const read = (key: string): number | undefined => {
    const raw = searchParams.get(key);
    if (raw === null || raw.trim() === '') {
      return undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return { offset: read('offset'), limit: read('limit') };
}

/**
 * 从查询串解析检索过滤器（GET 检索用；缺失即默认行为，与 Rust `#[serde(default)]` 对齐）。
 * `excludedPaths` 为 JSON 数组字符串，非法时忽略该项而非整包拒绝。
 */
function parseFilterFromQuery(searchParams: URLSearchParams): {
  excludedPaths?: string[];
  useGitignore?: boolean;
} {
  const filter: { excludedPaths?: string[]; useGitignore?: boolean } = {};
  const rawPaths = searchParams.get('excludedPaths');
  if (rawPaths !== null && rawPaths.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(rawPaths);
      if (Array.isArray(parsed)) {
        filter.excludedPaths = parsed.filter(
          (p): p is string => typeof p === 'string' && p.length > 0,
        );
      }
    } catch {
      // 非法 JSON 即忽略该项：检索仍可执行，不整包拒绝。
    }
  }
  const rawGitignore = searchParams.get('useGitignore');
  if (rawGitignore === '1') {
    filter.useGitignore = true;
  } else if (rawGitignore === '0') {
    filter.useGitignore = false;
  }
  return filter;
}

function parseFilterFromBody(input: { excludedPaths?: unknown; useGitignore?: unknown }): {
  excludedPaths?: string[];
  useGitignore?: boolean;
} {
  const filter: { excludedPaths?: string[]; useGitignore?: boolean } = {};
  if (Array.isArray(input.excludedPaths)) {
    // dev 预览宽容截断到 2000（服务端同值直接拒绝；此处截断不断整轮检索）。
    filter.excludedPaths = input.excludedPaths
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .slice(0, 2000);
  }
  if (typeof input.useGitignore === 'boolean') {
    filter.useGitignore = input.useGitignore;
  }
  return filter;
}

/** 空过滤器归一为 `undefined`：与"未传参"语义完全一致，下游无需区分。 */
function normalizeFilter(filter: {
  excludedPaths?: string[];
  useGitignore?: boolean;
}): { excludedPaths?: string[]; useGitignore?: boolean } | undefined {
  const hasPaths = filter.excludedPaths !== undefined && filter.excludedPaths.length > 0;
  return !hasPaths && filter.useGitignore === undefined ? undefined : filter;
}

function makePath(relativePath: string): string {
  return `${API_PREFIX}${relativePath}`;
}

function extractHeaderToken(request: IncomingMessage): string {
  const headers = request.headers;
  const rawToken =
    typeof headers.get === 'function'
      ? (headers.get('x-ci-access-token') ?? headers.get('X-CI-Access-Token'))
      : Array.isArray(headers['x-ci-access-token'])
        ? headers['x-ci-access-token'][0]
        : headers['x-ci-access-token'];
  return (rawToken as string) ?? '';
}

const routes: Route[] = [
  {
    method: 'POST',
    pathname: makePath('/workspace/open'),
    handler: async (_req, body) => {
      const b = body as { workspacePath?: string } | undefined;
      if (!b?.workspacePath?.trim()) return fail('workspacePath is required', 'INVALID_INPUT');
      return ok(await files.openWorkspace(b.workspacePath.trim()));
    },
  },
  {
    method: 'POST',
    pathname: makePath('/workspace/pick-directory'),
    handler: async () => ok(await pickDirectory()),
  },
  {
    method: 'POST',
    pathname: makePath('/workspace/reveal'),
    handler: async (_req, body) => {
      const b = body as { path?: string } | undefined;
      if (!b?.path?.trim()) return fail('path is required', 'INVALID_INPUT');
      return ok(await revealInFileManager(b.path.trim()));
    },
  },
  {
    method: 'POST',
    pathname: makePath('/clipboard/save-file'),
    handler: async (_req, body) => {
      const b = body as { suggestedName?: string; dataBase64?: string } | undefined;
      if (!b?.suggestedName?.trim()) return fail('suggestedName is required', 'INVALID_INPUT');
      if (typeof b.dataBase64 !== 'string' || !isValidBase64Payload(b.dataBase64)) {
        return fail('dataBase64 is required', 'INVALID_INPUT');
      }
      const target = await pickSavePath(b.suggestedName);
      // 用户取消对话框：不落盘、不报错（与桌面端 Ok(None) 同一语义）。
      if (!target) return ok<{ path?: string }>({});
      try {
        // 异步写盘：Base64 图片可达数十 MB，同步写会阻塞预览服务事件循环。
        await writeFile(target, Buffer.from(b.dataBase64, 'base64'));
      } catch (e) {
        // 错误信息只带基名：绝对路径进 IPC 错误体是路径信息外泄（dev 本地风险低，仍收敛）。
        return fail(
          `failed to write ${path.basename(target)}: ${e instanceof Error ? e.message : String(e)}`,
          'IO_ERROR',
        );
      }
      return ok({ path: target });
    },
  },
  {
    method: 'POST',
    pathname: makePath('/workspace/write-debug-logs'),
    handler: async (_req, body) => {
      const b = body as
        | { rootPath?: string; content?: string; mode?: 'overwrite' | 'append' | 'multi' }
        | undefined;
      if (!b?.rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      return ok(
        await logging.writeDebugLogs(b.rootPath.trim(), b.content ?? '', b.mode ?? 'overwrite'),
      );
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/app-directory'),
    handler: async () => {
      const appDirectory = path.resolve(process.cwd(), '../../');
      return ok(appDirectory);
    },
  },
  {
    method: 'POST',
    pathname: makePath('/workspace/create-file'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; relativePath?: string; content?: string } | undefined;
      if (!b?.rootPath?.trim() || !b?.relativePath?.trim())
        return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.createFile(b.rootPath.trim(), b.relativePath.trim(), b.content ?? ''));
    },
  },
  {
    method: 'POST',
    pathname: makePath('/workspace/create-folder'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; relativePath?: string } | undefined;
      if (!b?.rootPath?.trim() || !b?.relativePath?.trim())
        return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.createFolder(b.rootPath.trim(), b.relativePath.trim()));
    },
  },
  {
    method: 'POST',
    pathname: makePath('/workspace/rename-file'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; relativePath?: string; newName?: string } | undefined;
      if (!b?.rootPath?.trim() || !b?.relativePath?.trim() || !b?.newName?.trim())
        return fail('rootPath, relativePath, and newName are required', 'INVALID_INPUT');
      return ok(await files.renameFile(b.rootPath.trim(), b.relativePath.trim(), b.newName.trim()));
    },
  },
  {
    method: 'POST',
    pathname: makePath('/workspace/delete-file'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; relativePath?: string } | undefined;
      if (!b?.rootPath?.trim() || !b?.relativePath?.trim())
        return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.deleteFileEntry(b.rootPath.trim(), b.relativePath.trim()));
    },
  },
  {
    method: 'POST',
    pathname: makePath('/workspace/duplicate-file'),
    handler: async (_req, body) => {
      const b = body as
        | { rootPath?: string; srcRelativePath?: string; dstRelativePath?: string }
        | undefined;
      if (!b?.rootPath?.trim() || !b?.srcRelativePath?.trim() || !b?.dstRelativePath?.trim())
        return fail('rootPath, srcRelativePath, and dstRelativePath are required', 'INVALID_INPUT');
      return ok(
        await files.duplicateFile(
          b.rootPath.trim(),
          b.srcRelativePath.trim(),
          b.dstRelativePath.trim(),
        ),
      );
    },
  },
  {
    method: 'POST',
    pathname: makePath('/workspace/move-file'),
    handler: async (_req, body) => {
      const b = body as { rootPath?: string; relativePath?: string; newPath?: string } | undefined;
      if (!b?.rootPath?.trim() || !b?.relativePath?.trim() || !b?.newPath?.trim())
        return fail('rootPath, relativePath, and newPath are required', 'INVALID_INPUT');
      return ok(await files.moveFile(b.rootPath.trim(), b.relativePath.trim(), b.newPath.trim()));
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/tree'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      return ok(await files.listTree(rootPath));
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/file'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const relativePath = searchParams.get('relativePath');
      if (!rootPath?.trim() || !relativePath?.trim())
        return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.readFile(rootPath, relativePath));
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/media'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const relativePath = searchParams.get('relativePath');
      if (!rootPath?.trim() || !relativePath?.trim())
        return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.readMediaFile(rootPath, relativePath));
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/change-preview'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const relativePath = searchParams.get('relativePath');
      if (!rootPath?.trim() || !relativePath?.trim())
        return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await git.readChangePreview(rootPath, relativePath));
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/search'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const query = searchParams.get('query') ?? '';
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      return ok(
        await search.searchText(
          rootPath,
          query,
          parseWindow(searchParams),
          normalizeFilter(parseFilterFromQuery(searchParams)),
        ),
      );
    },
  },
  {
    method: 'POST',
    pathname: makePath('/workspace/search-in-files'),
    handler: async (_req, body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const input = body as
        | {
            paths?: string[];
            query?: string;
            offset?: number;
            limit?: number;
            excludedPaths?: unknown;
            useGitignore?: unknown;
          }
        | undefined;
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      if (!input || !Array.isArray(input.paths) || typeof input.query !== 'string') {
        return fail('paths and query are required', 'INVALID_INPUT');
      }
      return ok(
        await search.searchInFiles(
          rootPath,
          input.paths,
          input.query,
          {
            offset: input.offset,
            limit: input.limit,
          },
          normalizeFilter(parseFilterFromBody(input)),
        ),
      );
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/files-changed'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const since = Number(searchParams.get('since') ?? '0');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      if (!Number.isFinite(since) || since < 0)
        return fail('since must be a non-negative number', 'INVALID_INPUT');
      return ok(workspaceWatchers.ensure(rootPath).since(since));
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/outline'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const relativePath = searchParams.get('relativePath');
      if (!rootPath?.trim() || !relativePath?.trim())
        return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.outline(rootPath, relativePath));
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/git-status'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      return ok(await git.captureGitSnapshot(rootPath));
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/git-branches'),
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
    method: 'POST',
    pathname: makePath('/workspace/git-switch'),
    handler: async (_req, body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      const input = body as Record<string, unknown> | undefined;
      if (!input) return fail('branch switch payload is required', 'INVALID_INPUT');
      return ok(await git.switchGitBranch(rootPath, input as any));
    },
  },
  {
    method: 'POST',
    pathname: makePath('/workspace/git-create-branch'),
    handler: async (_req, body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      const input = body as Record<string, unknown> | undefined;
      if (!input) return fail('branch creation payload is required', 'INVALID_INPUT');
      return ok(await git.createGitBranch(rootPath, input as any));
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/absolute-path'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const relativePath = searchParams.get('relativePath');
      if (!rootPath?.trim() || !relativePath?.trim())
        return fail('rootPath and relativePath are required', 'INVALID_INPUT');
      return ok(await files.getAbsolutePath(rootPath, relativePath));
    },
  },
  {
    method: 'GET',
    pathname: makePath('/retrieval/status'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      const workspaceId =
        searchParams.get('workspaceId') ?? files.createWorkspaceId(rootPath ?? '');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      return ok(await files.buildRetrievalSnapshot(workspaceId, rootPath));
    },
  },
  {
    method: 'GET',
    pathname: makePath('/ci/status'),
    handler: async (req, _body, searchParams) => {
      const owner = searchParams.get('owner') ?? '';
      const repo = searchParams.get('repo') ?? '';
      const branch = searchParams.get('branch') ?? 'main';
      if (!owner.trim() || !repo.trim())
        return fail('owner and repo are required', 'INVALID_INPUT');
      const token = extractHeaderToken(req);
      const snapshot = await ciModule.fetchCiStatus(owner, repo, branch, token || ciAccessToken);
      if (snapshot.error) return fail(snapshot.error, 'GITHUB_API_ERROR');
      return ok(snapshot);
    },
  },
  {
    method: 'GET',
    pathname: makePath('/ci/has-access-token'),
    handler: async () => ok(ciAccessToken.length > 0),
  },
  {
    method: 'POST',
    pathname: makePath('/ci/set-access-token'),
    handler: async (_req, body) => {
      const b = body as { token?: string } | undefined;
      ciAccessToken = typeof b?.token === 'string' ? b.token.trim() : '';
      return ok(true);
    },
  },
  {
    method: 'POST',
    pathname: makePath('/ci/clear-access-token'),
    handler: async () => {
      ciAccessToken = '';
      return ok(true);
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/git-vis-commit-stats'),
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
    method: 'GET',
    pathname: makePath('/workspace/git-vis-code-evolution'),
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
    method: 'GET',
    pathname: makePath('/workspace/git-vis-contributor-modules'),
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
    method: 'GET',
    pathname: makePath('/workspace/git-vis-branch-graph'),
    handler: async (_req, _body, searchParams) => {
      const rootPath = searchParams.get('rootPath');
      if (!rootPath?.trim()) return fail('rootPath is required', 'INVALID_INPUT');
      const data = await gitVis.handleBranchGraph(rootPath);
      return ok(data);
    },
  },
  {
    method: 'GET',
    pathname: makePath('/workspace/git-vis-file-hotspots'),
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
    method: 'POST',
    pathname: makePath('/browser/page-meta/get'),
    handler: async (_req, body) => {
      const b = body as { url?: string; force?: boolean } | undefined;
      if (!b?.url) return fail('url is required', 'INVALID_INPUT');
      return ok(await pageMetaSvc.get(b.url, b.force));
    },
  },
  {
    method: 'POST',
    pathname: makePath('/browser/page-meta/report'),
    handler: async (_req, body) => {
      const b = body as
        | { url?: string; title?: string; favicon?: string; source?: string }
        | undefined;
      if (!b?.url) return fail('url is required', 'INVALID_INPUT');
      return ok(
        await pageMetaSvc.report(
          b.url,
          b.title ?? '',
          b.favicon ?? '',
          (b.source ?? '') as MetaSource,
        ),
      );
    },
  },
  {
    method: 'POST',
    pathname: makePath('/browser/page-meta/refresh'),
    handler: async (_req, body) => {
      const b = body as { url?: string } | undefined;
      if (!b?.url) return fail('url is required', 'INVALID_INPUT');
      return ok(await pageMetaSvc.get(b.url, true));
    },
  },
  {
    method: 'POST',
    pathname: makePath('/browser/page-meta/warmup'),
    handler: async (_req, body) => {
      const b = body as { urls?: unknown } | undefined;
      if (!Array.isArray(b?.urls) || b.urls.some((u) => typeof u !== 'string')) {
        return fail('urls is required', 'INVALID_INPUT');
      }
      if ((b.urls as string[]).length > 200) {
        return fail('URL list exceeds maximum length of 200', 'INVALID_INPUT');
      }
      const metas = await pageMetaSvc.warmup(b.urls as string[]);
      return ok(metas);
    },
  },
  {
    method: 'GET',
    pathname: makePath('/browser/site-meta-cache'),
    handler: async (_req, _body, searchParams) => {
      const baseDir = searchParams.get('baseDir') ?? process.cwd();
      return ok(await siteMetaCache.readSiteMetaCache(baseDir));
    },
  },
  {
    method: 'PUT',
    pathname: makePath('/browser/site-meta-cache'),
    handler: async (_req, body) => putSiteMetaCacheRoute(body),
  },
  {
    method: 'DELETE',
    pathname: makePath('/browser/site-meta-cache'),
    handler: async (_req, body) => deleteSiteMetaCacheRoute(body),
  },
];

export async function handlePreviewWorkspaceApi(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? API_PREFIX, 'http://127.0.0.1');
  if (!isPreviewWorkspaceApiRequest(requestUrl.pathname)) return false;

  try {
    const route = routes.find(
      (r) => r.method === request.method && requestUrl.pathname === r.pathname,
    );
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
    // 携带 code 的服务错误透传 code（与 Rust 错误码对齐），其余保持默认码。
    const code =
      error instanceof files.PreviewServiceError ? error.code : 'PREVIEW_WORKSPACE_ERROR';
    writeJson(response, fail(message, code));
    return true;
  }
}
