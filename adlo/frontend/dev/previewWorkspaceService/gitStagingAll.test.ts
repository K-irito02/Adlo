// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { discardAll, stageAll, unstageAll, commitChanges, runGit } from './git';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepo(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'adl-preview-staging-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'adl-tests@example.com']);
  git(root, ['config', 'user.name', 'adl-tests']);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('preview git staging-all operations', () => {
  it('discardAll clears the index and worktree for an unborn repo (staged then edited)', async () => {
    const { root, cleanup } = initRepo();
    writeFileSync(join(root, 'one.txt'), '1\n');
    writeFileSync(join(root, 'two.txt'), '2\n');
    await stageAll(root);
    // 暂存后继续编辑：git rm --cached 需要 -f 才能放行。
    writeFileSync(join(root, 'one.txt'), '1-edited\n');

    await discardAll(root);

    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
    expect(existsSync(join(root, 'one.txt'))).toBe(false);
    expect(existsSync(join(root, 'two.txt'))).toBe(false);
    cleanup();
  });

  it('unstageAll clears the index but keeps files in an unborn repo', async () => {
    const { root, cleanup } = initRepo();
    writeFileSync(join(root, 'one.txt'), '1\n');
    await stageAll(root);

    await unstageAll(root);

    expect(git(root, ['diff', '--cached', '--name-only'])).toBe('');
    expect(existsSync(join(root, 'one.txt'))).toBe(true);
    cleanup();
  });

  it('discardAll restores tracked files and removes untracked ones when HEAD exists', async () => {
    const { root, cleanup } = initRepo();
    writeFileSync(join(root, 'tracked.txt'), 'hello\n');
    git(root, ['add', 'tracked.txt']);
    git(root, ['commit', '-m', 'init']);
    writeFileSync(join(root, 'tracked.txt'), 'changed\n');
    writeFileSync(join(root, 'loose.txt'), 'loose\n');

    await discardAll(root);

    expect(readFileSync(join(root, 'tracked.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe('hello\n');
    expect(existsSync(join(root, 'loose.txt'))).toBe(false);
    cleanup();
  });

  it('commitChanges rejects an empty message before running git', async () => {
    const { root, cleanup } = initRepo();
    await expect(commitChanges(root, '   ')).rejects.toThrow('commit message is empty');
    cleanup();
  });

  it('discardAll rejects a corrupt branch ref instead of clearing the worktree', async () => {
    const { root, cleanup } = initRepo();
    writeFileSync(join(root, 'tracked.txt'), 'hello\n');
    git(root, ['add', 'tracked.txt']);
    git(root, ['commit', '-m', 'init']);
    const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
    writeFileSync(join(root, '.git', 'refs', 'heads', branch), 'not a valid oid\n');

    await expect(discardAll(root)).rejects.toThrow();
    expect(existsSync(join(root, 'tracked.txt'))).toBe(true);
    cleanup();
  });

  it('discardAll rejects a corrupt packed ref instead of clearing the worktree', async () => {
    const { root, cleanup } = initRepo();
    writeFileSync(join(root, 'tracked.txt'), 'hello\n');
    git(root, ['add', 'tracked.txt']);
    git(root, ['commit', '-m', 'init']);
    const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
    try {
      rmSync(join(root, '.git', 'refs', 'heads', branch));
    } catch {
      // 已经被 pack 的仓库没有 loose ref，直接写 packed-refs 即可。
    }
    writeFileSync(
      join(root, '.git', 'packed-refs'),
      `0000000000000000000000000000000000000000 refs/heads/${branch}\n`,
    );

    await expect(discardAll(root)).rejects.toThrow();
    expect(existsSync(join(root, 'tracked.txt'))).toBe(true);
    cleanup();
  });

  it('does not arm the 30s timer when the caller passes a null timeout', async () => {
    const { root, cleanup } = initRepo();
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await runGit(root, ['status'], null);
    const armedThirtySeconds = spy.mock.calls.some((call) => call[1] === 30_000);
    spy.mockRestore();
    expect(armedThirtySeconds).toBe(false);
    cleanup();
  });
});
