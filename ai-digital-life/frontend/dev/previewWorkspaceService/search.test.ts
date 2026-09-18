// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchInFiles, searchText } from './search';

describe('preview searchInFiles', () => {
  it('pages with precise hasMore like the Rust backend', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-search-page-'));
    writeFileSync(join(root, 'a.md'), 'needle 1\nneedle 2\nneedle 3');
    const page1 = await searchText(root, 'needle', { limit: 2 });
    expect(page1.hits.map((h) => h.line)).toEqual([1, 2]);
    expect(page1.hasMore).toBe(true);
    const page2 = await searchText(root, 'needle', { offset: 2, limit: 2 });
    expect(page2.hits.map((h) => h.line)).toEqual([3]);
    expect(page2.hasMore).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('skips traversal escapes and missing files without failing the batch', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-search-'));
    writeFileSync(join(root, 'ok.md'), 'needle here');
    const page = await searchInFiles(root, ['ok.md', '../escape.md', 'gone.md', ''], 'needle');
    expect(page.hits.map((h) => h.path)).toEqual(['ok.md']);
    expect(page.hasMore).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('returns an empty page for blank query like the other bridges', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-search-q-'));
    writeFileSync(join(root, 'a.md'), 'hello');
    expect(await searchInFiles(root, ['a.md'], '   ')).toEqual({ hits: [], hasMore: false });
    expect(await searchText(root, '   ')).toEqual({ hits: [], hasMore: false });
    rmSync(root, { recursive: true, force: true });
  });
});
