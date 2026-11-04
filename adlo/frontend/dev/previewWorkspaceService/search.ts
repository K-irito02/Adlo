import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { relativePath, normalizePath, collectTextFiles } from './files';
import type {
  WorkspaceSearchFilter,
  WorkspaceSearchHit,
  WorkspaceSearchPage,
  WorkspaceSearchWindow,
} from '../../src/kernel/index';
import { normalizeSearchWindow, paginateSearchHits } from '../../src/shared/ipc/searchWindow';
import {
  createGitignoreMatcher,
  isSearchPathExcluded,
  type GitignoreRuleSet,
} from '../../src/shared/ipc/searchIgnore';

/** 单批路径上限（DoS 护栏，与服务端 search-in-files 同级）。 */
const MAX_SEARCH_PATHS = 2000;
/** 流式读缓冲（与 Rust SEARCH_READ_BUFFER_BYTES 同值）。 */
const SEARCH_READ_CHUNK = 64 * 1024;
/** 单行匹配上限（与 Rust MAX_SEARCH_LINE_BYTES 同值，病态单行护栏）。 */
const MAX_SEARCH_LINE_BYTES = 8 * 1024 * 1024;
/** 单次检索最多读取的 `.gitignore` 文件数（DoS 护栏：超深嵌套仓库裁剪）。 */
const MAX_GITIGNORE_FILES = 64;
/** 单个 `.gitignore` 体积上限（与 Rust `MAX_GITIGNORE_BYTES` 同值，超限跳过）。 */
const MAX_GITIGNORE_BYTES = 64 * 1024;

/**
 * 自工作区根向下收集全部 `.gitignore`（根在前、深层在后，与 Rust 侧同序）。
 * 缺失/不可读即跳过；本次检索结束即丢弃（`.gitignore` 改完下次检索立即生效）。
 */
async function loadGitignoreChain(rootPath: string): Promise<GitignoreRuleSet[]> {
  const sets: GitignoreRuleSet[] = [];
  const stack: string[] = [''];
  while (stack.length > 0 && sets.length < MAX_GITIGNORE_FILES) {
    const dir = stack.pop();
    if (dir === undefined) {
      continue;
    }
    const abs = dir === '' ? rootPath : join(rootPath, dir);
    let entries: Array<{ name: string; isDirectory: boolean }>;
    try {
      entries = (await fs.readdir(abs, { withFileTypes: true }))
        .filter((e) => e.isDirectory() || e.name === '.gitignore')
        .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }
        stack.push(dir === '' ? entry.name : `${dir}/${entry.name}`);
      } else {
        const fileAbs = join(abs, entry.name);
        try {
          // 与 Rust 同值：超大文件跳过，避免整读进内存（事项 M4）。
          const size = statSync(fileAbs).size;
          if (size > MAX_GITIGNORE_BYTES) {
            continue;
          }
          const content = await fs.readFile(fileAbs, 'utf8');
          sets.push({ baseDir: dir, content });
        } catch {
          // TOCTOU 删除/无权限：单文件跳过。
        }
      }
    }
  }
  // 栈是 LIFO：按 baseDir 深度排序保证根在前、深层在后（同级顺序无关）。
  sets.sort((a, b) => a.baseDir.length - b.baseDir.length);
  return sets;
}

/** 过滤器生效：手动名单与 `.gitignore` 并集，命中即跳过（窗口截断之前）。 */
function makeFileAllowed(
  filter: WorkspaceSearchFilter | undefined,
  gitignore: ((path: string, isDir: boolean) => boolean) | undefined,
): (relative: string) => boolean {
  const excluded = filter?.excludedPaths ?? [];
  const useGitignore = filter?.useGitignore ?? true;
  return (relative: string) => {
    if (isSearchPathExcluded(relative, excluded)) {
      return false;
    }
    if (useGitignore && gitignore && gitignore(relative, false)) {
      return false;
    }
    return true;
  };
}

async function resolveGitignore(
  rootPath: string,
  filter: WorkspaceSearchFilter | undefined,
): Promise<((path: string, isDir: boolean) => boolean) | undefined> {
  if ((filter?.useGitignore ?? true) === false) {
    return undefined;
  }
  return createGitignoreMatcher(await loadGitignoreChain(rootPath));
}

/**
 * 流式扫描单文件（ripgrep-style C，与 Rust search.rs 同语义）：
 * 无总大小上限（内存恒 O(行)）；NUL 即停扫该文件但保留已得命中；
 * 超 8MB 单行截断匹配；非 UTF-8 按 lossy（Buffer.toString 默认替换）尽力匹配；
 * CRLF 按 \n 分行再去尾 \r（与 Rust strip 同语义）。
 * @returns true 表示已达 ceiling（调用方直接分页返回）。
 */
async function scanFileHits(
  absolutePath: string,
  displayPath: string,
  needle: string,
  ceiling: number,
  hits: WorkspaceSearchHit[],
): Promise<boolean> {
  let fh: fs.FileHandle | undefined;
  try {
    fh = await fs.open(absolutePath, 'r');
  } catch {
    return false;
  }
  try {
    let filePos = 0;
    let lineNumber = 0;
    const chunk = Buffer.allocUnsafe(SEARCH_READ_CHUNK);
    for (;;) {
      // 读一个逻辑行（至多存 cap；超长丢弃但消费对齐；NUL 仅判到本行）。
      const parts: Buffer[] = [];
      let stored = 0;
      let sawNul = false;
      let eof = false;
      let ok = true;
      for (;;) {
        let bytesRead = 0;
        try {
          ({ bytesRead } = await fh.read(chunk, 0, chunk.length, filePos));
        } catch {
          ok = false;
          break;
        }
        if (bytesRead === 0) {
          eof = true;
          break;
        }
        const avail = chunk.subarray(0, bytesRead);
        const nl = avail.indexOf(10);
        if (nl !== -1) {
          const end = nl + 1;
          if (avail.subarray(0, end).includes(0)) sawNul = true;
          const take = Math.min(end, MAX_SEARCH_LINE_BYTES - stored);
          if (take > 0) parts.push(Buffer.from(avail.subarray(0, take))); // copy: subarray is a view, re-read would clobber it;
          stored += take;
          filePos += end;
          break;
        }
        if (avail.includes(0)) sawNul = true;
        const take = Math.min(avail.length, MAX_SEARCH_LINE_BYTES - stored);
        if (take > 0) parts.push(Buffer.from(avail.subarray(0, take))); // copy: subarray is a view, re-read would clobber it;
        stored += take;
        filePos += avail.length;
      }
      if (!ok) break;
      if (sawNul) break;
      if (parts.length === 0) break; // EOF 且无残留（空文件/尾换行后），无行可匹配。
      lineNumber += 1;
      let text = Buffer.concat(parts).toString('utf8');
      if (text.endsWith('\n')) text = text.slice(0, -1);
      if (text.endsWith('\r')) text = text.slice(0, -1);
      if (text.toLowerCase().includes(needle)) {
        hits.push({ path: displayPath, line: lineNumber, preview: text.trim().slice(0, 240) });
        if (hits.length >= ceiling) return true;
      }
      // 尾行（无换行）已处理：eof 即结束（否则下轮读到空才出，多一次 syscall）。
      // 无换行且非 eof 不可能（内循环读到换行/EOF 才出）。
      if (eof) break;
    }
    return false;
  } finally {
    await fh.close().catch(() => {});
  }
}

export async function searchText(
  rootPath: string,
  query: string,
  window?: WorkspaceSearchWindow,
  filter?: WorkspaceSearchFilter,
): Promise<WorkspaceSearchPage> {
  if (!query.trim()) {
    return { hits: [], hasMore: false };
  }
  // 与 Rust 同语义：只收集到"窗口需要的那一条之后"即停，hasMore 由多探一条得出。
  const { offset, limit } = normalizeSearchWindow(window);
  const ceiling = offset + limit + 1;
  const files: string[] = [];
  await collectTextFiles(rootPath, rootPath, files);
  const allowed = makeFileAllowed(filter, await resolveGitignore(rootPath, filter));
  const needle = query.toLowerCase();
  const hits: WorkspaceSearchHit[] = [];
  for (const filePath of files) {
    const workspaceRelativePath = relativePath(rootPath, filePath);
    if (!allowed(workspaceRelativePath)) {
      continue;
    }
    // ripgrep-style C（与 Rust 同形）：流式扫描，无总大小上限；单文件读错/
    // 二进制即跳过（scanFileHits 内部处理），不能让一个文件拖垮整轮检索。
    if (await scanFileHits(filePath, workspaceRelativePath, needle, ceiling, hits)) {
      return paginateSearchHits(hits, window);
    }
  }
  return paginateSearchHits(hits, window);
}

export async function searchInFiles(
  rootPath: string,
  paths: string[],
  query: string,
  window?: WorkspaceSearchWindow,
  filter?: WorkspaceSearchFilter,
): Promise<WorkspaceSearchPage> {
  const needle = query.toLowerCase();
  if (!needle.trim()) {
    return { hits: [], hasMore: false };
  }
  const { offset, limit } = normalizeSearchWindow(window);
  const ceiling = offset + limit + 1;
  const hits: WorkspaceSearchHit[] = [];
  const allowed = makeFileAllowed(filter, await resolveGitignore(rootPath, filter));
  const limited = paths.slice(0, MAX_SEARCH_PATHS);
  for (const candidatePath of limited) {
    if (typeof candidatePath !== 'string') {
      continue;
    }
    // 路径穿越 guard：归一化后必须仍在 root 内（dev 服务亦守工作区边界）。
    const absolute = normalize(join(rootPath, candidatePath));
    const rel = relative(rootPath, absolute);
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`)) {
      continue;
    }
    // watcher 重算同样受检索设置约束：被忽略的文件不再回写命中。
    if (!allowed(normalizePath(rel))) {
      continue;
    }
    // ripgrep-style C：流式扫描（不存在/无权限/二进制由 scanFileHits 内部跳过）。
    if (!existsSync(absolute)) {
      continue;
    }
    if (await scanFileHits(absolute, candidatePath, needle, ceiling, hits)) {
      return paginateSearchHits(hits, window);
    }
  }
  return paginateSearchHits(hits, window);
}
