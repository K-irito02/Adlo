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

  it('scans large text files like the Rust backend (ripgrep-style C)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-search-large-'));
    const big = Buffer.alloc(2 * 1024 * 1024, 'x');
    big.write('needle', 1_000_000);
    writeFileSync(join(root, 'huge.txt'), big);
    const page = await searchText(root, 'needle');
    expect(page.hits.map((h) => h.path)).toEqual(['huge.txt']);
    rmSync(root, { recursive: true, force: true });
  });

  it('keeps pre-NUL hits but stops at NUL like the Rust backend', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-search-nul-'));
    writeFileSync(join(root, 'mixed.txt'), Buffer.concat([
      Buffer.from('needle first\n', 'utf8'),
      Buffer.from([0]),
      Buffer.from('needle second\n', 'utf8'),
    ]));
    const page = await searchInFiles(root, ['mixed.txt'], 'needle');
    expect(page.hits.length).toBe(1);
    expect(page.hits[0].line).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it('matches non-UTF-8 files lossily like the Rust backend', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-search-lossy-'));
    writeFileSync(
      join(root, 'latin.txt'),
      Buffer.concat([Buffer.from('prefix needle ', 'utf8'), Buffer.from([0xff, 0xfe]), Buffer.from(' suffix\n', 'utf8')]),
    );
    const page = await searchInFiles(root, ['latin.txt'], 'needle');
    expect(page.hits.length).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it('numbers CRLF lines like LF lines', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-search-crlf-'));
    writeFileSync(join(root, 'dos.txt'), 'needle\r\nsecond\r\n');
    const page = await searchInFiles(root, ['dos.txt'], 'needle');
    expect(page.hits.length).toBe(1);
    expect(page.hits[0].line).toBe(1);
    const page2 = await searchInFiles(root, ['dos.txt'], 'second');
    expect(page2.hits[0].line).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });

  it('truncates pathological single lines at 8MB like the Rust backend (P4-R1-R2)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-search-guard-'));
    const before = Buffer.alloc(9 * 1024 * 1024, 'y');
    before.write('needle', 100);
    before.write('\n', before.length - 1);
    writeFileSync(join(root, 'wide.txt'), before);
    const page = await searchInFiles(root, ['wide.txt'], 'needle');
    expect(page.hits.length).toBe(1);
    expect(page.hits[0].line).toBe(1);

    const beyond = Buffer.alloc(9 * 1024 * 1024, 'y');
    beyond.write('needle', 8_500_000);
    beyond.write('\n', beyond.length - 1);
    writeFileSync(join(root, 'wide2.txt'), beyond);
    const page2 = await searchInFiles(root, ['wide2.txt'], 'needle');
    expect(page2.hits.length).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });
});
