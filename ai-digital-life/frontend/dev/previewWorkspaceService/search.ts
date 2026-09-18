import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { relativePath, normalizePath, collectTextFiles } from './files';
import type { WorkspaceSearchHit } from '../../src/kernel/index';

const MAX_SEARCH_RESULTS = 200;
/** 单批路径上限（DoS 护栏，与服务端 search-in-files 同级）。 */
const MAX_SEARCH_PATHS = 2000;
/** 单文件体积上限（与 Rust 全量检索 1MB 同级，超限跳过不读入内存）。 */
const MAX_FILE_BYTES = 1024 * 1024;

export async function searchText(rootPath: string, query: string): Promise<WorkspaceSearchHit[]> {
  if (!query.trim()) {
    return [];
  }
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
      if (hits.length >= MAX_SEARCH_RESULTS) {
        return hits;
      }
    }
  }
  return hits;
}

export async function searchInFiles(
  rootPath: string,
  paths: string[],
  query: string,
): Promise<WorkspaceSearchHit[]> {
  const needle = query.toLowerCase();
  if (!needle.trim()) {
    return [];
  }
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
      if (hits.length >= MAX_SEARCH_RESULTS) {
        return hits;
      }
    }
  }
  return hits;
}
