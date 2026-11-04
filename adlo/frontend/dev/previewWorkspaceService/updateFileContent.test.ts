// @vitest-environment node
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { updateFileContent } from './files';

describe('preview updateFileContent (事项10 存盘链)', () => {
  it('覆盖写已存在文件并返回新 mtime 文档', { timeout: 60_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-update-'));
    try {
      writeFileSync(join(root, 'note.txt'), 'v1\n');
      const doc = await updateFileContent(root, 'note.txt', 'v2\n');
      expect(doc.content).toBe('v2\n');
      expect(readFileSync(join(root, 'note.txt'), 'utf8')).toBe('v2\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('不存在的文件拒绝写入', { timeout: 60_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-update-missing-'));
    try {
      await expect(updateFileContent(root, 'ghost.txt', 'x')).rejects.toThrow('file not found');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
