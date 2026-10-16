// @vitest-environment node
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  listGitBranches,
  listWorktrees,
  ensureBranchWorktree,
  removeBranchWorktree,
  pruneWorktrees,
  sanitizeBranchDir,
  siblingWorktreeDir,
  switchGitBranch,
} from './git';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepo(root: string) {
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'adl-tests@example.com']);
  git(root, ['config', 'user.name', 'adl-tests']);
}

/** 主仓 + 本地 bare 远端，构造 ahead/behind/diverged/synced 四态矩阵。 */
function setupMatrix(tag: string): { root: string; cleanup: () => void } {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), `adl-preview-wt-${tag}-`)));
  const remote = join(base, 'remote.git');
  const root = join(base, 'repo');
  execFileSync('git', ['init', '--bare', remote]);
  execFileSync('git', ['init', '-b', 'main', root]);
  git(root, ['config', 'user.email', 'adl-tests@example.com']);
  git(root, ['config', 'user.name', 'adl-tests']);
  git(root, ['remote', 'add', 'origin', remote]);
  writeFileSync(join(root, 'file.txt'), 'line1-main\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'init']);
  git(root, ['push', '-u', 'origin', 'main']);

  // ahead：本地多一个未推送提交
  git(root, ['checkout', '-b', 'feature-ahead']);
  writeFileSync(join(root, 'file.txt'), 'line1-main\nline2-ahead\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'ahead local']);
  git(root, ['push', '-u', 'origin', 'feature-ahead']);
  writeFileSync(join(root, 'file.txt'), 'line1-main\nline2-ahead\nline3-unpushed\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'ahead unpushed']);

  // behind：远端多一个提交，本地回退
  git(root, ['checkout', 'main']);
  git(root, ['checkout', '-b', 'feature-behind']);
  writeFileSync(join(root, 'file.txt'), 'line1-main\nline2-remote\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'behind remote']);
  git(root, ['push', '-u', 'origin', 'feature-behind']);
  git(root, ['reset', '--hard', 'HEAD~1']);

  // diverged：两侧各一个独有提交
  git(root, ['checkout', '-b', 'feature-diverged', 'main']);
  writeFileSync(join(root, 'file.txt'), 'line1-main\nline2-base\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'diverged base']);
  git(root, ['push', '-u', 'origin', 'feature-diverged']);
  writeFileSync(join(root, 'file.txt'), 'line1-main\nline2-base\nline3-local\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'diverged local']);
  const helper = join(base, 'helper');
  execFileSync('git', ['clone', remote, helper]);
  git(helper, ['config', 'user.email', 'adl-tests@example.com']);
  git(helper, ['config', 'user.name', 'adl-tests']);
  git(helper, ['checkout', 'feature-diverged']);
  writeFileSync(join(helper, 'remote-only.txt'), 'remote\n');
  git(helper, ['add', '.']);
  git(helper, ['commit', '-m', 'diverged remote']);
  git(helper, ['push', 'origin', 'feature-diverged']);

  git(root, ['checkout', 'main']);
  git(root, ['fetch', 'origin']);
  return { root, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

describe('preview listGitBranches divergence', () => {
  it('四态矩阵：ahead/behind/diverged/synced + upstream', { timeout: 120_000 }, async () => {
    const { root, cleanup } = setupMatrix('diverge');
    try {
      const branches = await listGitBranches(root);
      const byName = new Map(branches.map((b) => [b.name, b]));
      expect(byName.get('feature-ahead')?.divergeStatus).toBe('ahead');
      expect(byName.get('feature-ahead')?.ahead).toBe(1);
      expect(byName.get('feature-behind')?.divergeStatus).toBe('behind');
      expect(byName.get('feature-behind')?.behind).toBe(1);
      expect(byName.get('feature-diverged')?.divergeStatus).toBe('diverged');
      expect(byName.get('main')?.divergeStatus).toBe('synced');
      expect(byName.get('feature-ahead')?.upstream).toContain('feature-ahead');
      expect(byName.get('main')?.local).toBe(true);
      expect(byName.get('main')?.remote).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe('preview worktree lifecycle', () => {
  it('sibling 落点 + ensure/remove/prune 往返', { timeout: 120_000 }, async () => {
    const { root, cleanup } = setupMatrix('lifecycle');
    try {
      expect(await listWorktrees(root)).toHaveLength(1);
      const ensured = await ensureBranchWorktree(root, {
        branchName: 'feature-ahead',
        allowStash: false,
      });
      expect(ensured.created).toBe(true);
      expect(dirname(ensured.path)).toBe(join(dirname(root), `${basename(root)}-worktrees`));
      expect(readFileSync(join(ensured.path, 'file.txt'), 'utf8')).toContain('line3-unpushed');

      // 复用：第二次返回同一路径，不重写
      const reused = await ensureBranchWorktree(root, {
        branchName: 'feature-ahead',
        allowStash: false,
      });
      expect(reused.created).toBe(false);
      expect(reused.path).toBe(ensured.path);

      const listed = await listWorktrees(root);
      expect(listed).toHaveLength(2);
      // 回归：git 输出 `/` 必须归一化为系统分隔符，否则与 ensure 返回的路径对不上
      expect(listed[0].path).toBe(root);
      expect(listed.find((w) => w.branch === 'feature-ahead')?.path).toBe(ensured.path);

      // listGitBranches 标注 worktreePath
      const branches = await listGitBranches(root);
      expect(branches.find((b) => b.name === 'feature-ahead')?.worktreePath).toBe(ensured.path);

      await removeBranchWorktree(root, { branchName: 'feature-ahead', force: false });
      expect(await listWorktrees(root)).toHaveLength(1);
      await pruneWorktrees(root);
    } finally {
      cleanup();
    }
  });

  it('未知分支报错（本地远端都不存在）', { timeout: 120_000 }, async () => {
    const { root, cleanup } = setupMatrix('unknown');
    try {
      await expect(
        ensureBranchWorktree(root, { branchName: 'nope-missing', allowStash: false }),
      ).rejects.toThrow('branch not found');
    } finally {
      cleanup();
    }
  });
});

describe('preview switch modes', () => {
  it('remote 模式重置到远端（含 stash 隔离验证）', { timeout: 120_000 }, async () => {
    const { root, cleanup } = setupMatrix('remote-mode');
    try {
      // feature-behind 本地在 init，远端多一个提交 → remote 切后应与远端一致
      const result = await switchGitBranch(root, {
        branchName: 'feature-behind',
        allowStash: false,
        mode: 'remote',
      });
      expect(result.currentBranch).toBe('feature-behind');
      expect(result.hasRestored).toBe(true);
      expect(readFileSync(join(root, 'file.txt'), 'utf8')).toContain('line2-remote');
    } finally {
      cleanup();
    }
  });

  it('sync 模式快进成功', { timeout: 120_000 }, async () => {
    const { root, cleanup } = setupMatrix('sync-mode');
    try {
      const result = await switchGitBranch(root, {
        branchName: 'feature-behind',
        allowStash: false,
        mode: 'sync',
      });
      expect(result.currentBranch).toBe('feature-behind');
      expect(readFileSync(join(root, 'file.txt'), 'utf8')).toContain('line2-remote');
    } finally {
      cleanup();
    }
  });

  it('sync 冲突 abort 并报错（工作区保持干净）', { timeout: 180_000 }, async () => {
    const { root, cleanup } = setupMatrix('conflict');
    try {
      // 本地改出与远端同一行的冲突内容
      git(root, ['checkout', 'feature-diverged']);
      writeFileSync(join(root, 'file.txt'), 'line1-main\nline2-base\nline3-local-CONFLICT\n');
      git(root, ['add', '.']);
      git(root, ['commit', '-m', 'local conflicting']);
      // 远端侧再推一个同文件提交（helper 逻辑内联）
      const helper = join(dirname(root), 'helper2');
      execFileSync('git', ['clone', join(dirname(root), 'remote.git'), helper]);
      git(helper, ['config', 'user.email', 'adl-tests@example.com']);
      git(helper, ['config', 'user.name', 'adl-tests']);
      git(helper, ['checkout', 'feature-diverged']);
      writeFileSync(join(helper, 'file.txt'), 'line1-main\nline2-base\nline3-remote-CONFLICT\n');
      git(helper, ['add', '.']);
      git(helper, ['commit', '-m', 'remote conflicting']);
      git(helper, ['push', 'origin', 'feature-diverged']);
      await expect(
        switchGitBranch(root, {
          branchName: 'feature-diverged',
          allowStash: false,
          mode: 'sync',
        }),
      ).rejects.toThrow('sync conflict');
      // abort 后无 MERGE_HEAD 残留
      expect(existsSync(join(root, '.git', 'MERGE_HEAD'))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('脏工作区无确认直接拒绝（先 stash 门控）', { timeout: 120_000 }, async () => {
    const { root, cleanup } = setupMatrix('dirty');
    try {
      writeFileSync(join(root, 'dirty.txt'), 'uncommitted\n');
      await expect(
        switchGitBranch(root, { branchName: 'feature-ahead', allowStash: false }),
      ).rejects.toThrow('Dirty worktree');
    } finally {
      cleanup();
    }
  });
});

describe('preview stash count', () => {
  it('同分支多次自动 stash 显示计数', { timeout: 120_000 }, async () => {
    const { root, cleanup } = setupMatrix('stashcount');
    try {
      writeFileSync(join(root, 'scratch-a.txt'), 'a\n');
      execFileSync(
        'git',
        ['stash', 'push', '--include-untracked', '--message', 'adl-auto-stash:main:1'],
        { cwd: root },
      );
      writeFileSync(join(root, 'scratch-b.txt'), 'b\n');
      execFileSync(
        'git',
        ['stash', 'push', '--include-untracked', '--message', 'adl-auto-stash:main:2'],
        { cwd: root },
      );
      const branches = await listGitBranches(root);
      const main = branches.find((b) => b.name === 'main');
      expect(main?.hasStash).toBe(true);
      expect(main?.stashCount).toBe(2);
      expect(branches.find((b) => b.name === 'feature-ahead')?.stashCount ?? 0).toBe(0);
    } finally {
      cleanup();
    }
  });
});

describe('preview worktree path helpers', () => {
  it('sanitizeBranchDir 替换分隔符与保留字', () => {
    expect(sanitizeBranchDir('feature/foo')).toBe('feature-foo');
    expect(sanitizeBranchDir('a:b*c?d')).toBe('a-b-c-d');
    expect(sanitizeBranchDir('///')).toBe('branch');
  });

  it('siblingWorktreeDir 落在父目录同级', () => {
    const dir = siblingWorktreeDir(
      join('E:', 'AI-DIGITAL-LIFE', 'Git-Test-Repository'),
      'feature/x',
    );
    expect(dirname(dir)).toBe(join('E:', 'AI-DIGITAL-LIFE', 'Git-Test-Repository-worktrees'));
    expect(basename(dir)).toBe('feature-x');
  });

  it('initRepo 最小可用（冒烟）', () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-wt-smoke-'));
    try {
      initRepo(root);
      expect(existsSync(join(root, '.git'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
