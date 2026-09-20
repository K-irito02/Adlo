import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';import { relativePath, normalizePath, collectTextFiles } from './files';
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
/** 单文件体积上限（与 Rust 全量检索 1MB 同级，超限跳过不读入内存）。 */
const MAX_FILE_BYTES = 1024 * 1024;
/** 单次检索最多读取的 `.gitignore` 文件数（DoS 护栏：超深嵌套仓库裁剪）。 */
const MAX_GITIGNORE_FILES = 64;

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
        try {
          const content = await fs.readFile(join(abs, entry.name), 'utf8');
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
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].toLowerCase().includes(needle)) {
        continue;
      }
      hits.push({
        path: workspaceRelativePath,
        line: index + 1,
        preview: lines[index].trim().slice(0, 240),
      });
      if (hits.length >= ceiling) {
        return paginateSearchHits(hits, window);
      }
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
    let content: string;
    try {
      if (!existsSync(absolute)) {
        continue;
      }
      if (statSync(absolute).size > MAX_FILE_BYTES) {
        continue;
      }
      content = await fs.readFile(absolute, 'utf8');
    } catch {
      // TOCTOU 删除/无权限/二进制：单文件跳过，不拖垮整批。
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].toLowerCase().includes(needle)) {
        continue;
      }
      hits.push({
        path: candidatePath,
        line: index + 1,
        preview: lines[index].trim().slice(0, 240),
      });
      if (hits.length >= ceiling) {
        return paginateSearchHits(hits, window);
      }
    }
  }
  return paginateSearchHits(hits, window);
}
