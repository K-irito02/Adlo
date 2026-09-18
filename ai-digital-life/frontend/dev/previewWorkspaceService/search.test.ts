// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchInFiles, searchText } from './search';

describe('preview searchInFiles', () => {
  it('skips traversal escapes and missing files without failing the batch', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-search-'));
    writeFileSync(join(root, 'ok.md'), 'needle here');
    const hits = await searchInFiles(root, ['ok.md', '../escape.md', 'gone.md', ''], 'needle');
    expect(hits.map((h) => h.path)).toEqual(['ok.md']);
    rmSync(root, { recursive: true, force: true });
  });

  it('returns [] for blank query like the other bridges', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-search-q-'));
    writeFileSync(join(root, 'a.md'), 'hello');
    expect(await searchInFiles(root, ['a.md'], '   ')).toEqual([]);
    expect(await searchText(root, '   ')).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});
