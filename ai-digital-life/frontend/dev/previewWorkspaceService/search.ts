import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { relativePath, normalizePath, collectTextFiles } from './files';
import type {
  WorkspaceSearchHit,
  WorkspaceSearchPage,
  WorkspaceSearchWindow,
} from '../../src/kernel/index';
import { normalizeSearchWindow, paginateSearchHits } from '../../src/shared/ipc/searchWindow';

/** 单批路径上限（DoS 护栏，与服务端 search-in-files 同级）。 */
const MAX_SEARCH_PATHS = 2000;
/** 单文件体积上限（与 Rust 全量检索 1MB 同级，超限跳过不读入内存）。 */
const MAX_FILE_BYTES = 1024 * 1024;

export async function searchText(
  rootPath: string,
  query: string,
  window?: WorkspaceSearchWindow,
): Promise<WorkspaceSearchPage> {
  if (!query.trim()) {
    return { hits: [], hasMore: false };
  }
  // 与 Rust 同语义：只收集到"窗口需要的那一条之后"即停，hasMore 由多探一条得出。
  const { offset, limit } = normalizeSearchWindow(window);
  const ceiling = offset + limit + 1;
  const files: string[] = [];
  await collectTextFiles(rootPath, rootPath, files);
  const needle = query.toLowerCase();
  const hits: WorkspaceSearchHit[] = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    const workspaceRelativePath = relativePath(rootPath, filePath);
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
): Promise<WorkspaceSearchPage> {
  const needle = query.toLowerCase();
  if (!needle.trim()) {
    return { hits: [], hasMore: false };
  }
  const { offset, limit } = normalizeSearchWindow(window);
  const ceiling = offset + limit + 1;
  const hits: WorkspaceSearchHit[] = [];
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
