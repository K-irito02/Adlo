// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { readChangePreview } from './git';
import { sanitizeGitEnvForTest } from './testing/cleanGitEnv';

// 临时仓库测试：剥离 hook / 链接工作树注入的 GIT_DIR 等，否则 git 命令会落到真实仓库。
sanitizeGitEnvForTest();

function initRepo(root: string) {
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'adl-tests@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'adl-tests'], { cwd: root });
}

describe('preview readChangePreview large files (事项3)', () => {
  it('2MB 未跟踪文件可读（与开文件 8MB 对齐，不先于确认门拒绝）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-change-large-'));
    try {
      initRepo(root);
      const big = 'x'.repeat(2 * 1024 * 1024);
      writeFileSync(join(root, 'big.json'), big);
      const preview = await readChangePreview(root, 'big.json');
      expect(preview.currentContent.length).toBe(big.length);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('2MB base blob 可读（current 改小后 base 全量返回）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-change-large-base-'));
    try {
      initRepo(root);
      const big = 'y'.repeat(2 * 1024 * 1024);
      writeFileSync(join(root, 'big.json'), big);
      execFileSync('git', ['add', 'big.json'], { cwd: root });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: root });
      writeFileSync(join(root, 'big.json'), 'small');
      const preview = await readChangePreview(root, 'big.json');
      expect(preview.baseContent.length).toBe(big.length);
      expect(preview.currentContent).toBe('small');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
