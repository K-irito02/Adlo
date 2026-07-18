import fs from 'node:fs/promises';
import { relativePath, normalizePath, collectTextFiles } from './files';
import type { WorkspaceSearchHit } from '../../src/kernel/index';

const MAX_SEARCH_RESULTS = 200;

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
