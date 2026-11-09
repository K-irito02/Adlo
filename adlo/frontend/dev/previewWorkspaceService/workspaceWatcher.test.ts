// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workspaceWatchers, WorkspaceWatcher } from './workspaceWatcher';

describe('WorkspaceWatcher', () => {
  it('aggregates writes and ignores log noise', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-watch-'));
    const watcher = new WorkspaceWatcher();
    watcher.start(root);
    writeFileSync(join(root, 'debug-logs.txt'), 'noise');
    writeFileSync(join(root, 'kept.md'), 'content');
    await new Promise((resolve) => setTimeout(resolve, 900));
    const batch = watcher.since(0);
    expect(batch.changed).toContain('kept.md');
    expect(batch.changed.some((p) => p.includes('debug-logs'))).toBe(false);
    watcher.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it('classifies deletions as removed and ignores .adl-cache', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-watch-del-'));
    writeFileSync(join(root, 'gone.txt'), 'bye');
    mkdirSync(join(root, '.adl-cache'), { recursive: true });
    const watcher = new WorkspaceWatcher();
    watcher.start(root);
    writeFileSync(join(root, '.adl-cache', 'site-meta.json'), '{}');
    rmSync(join(root, 'gone.txt'));
    await new Promise((resolve) => setTimeout(resolve, 900));
    const batch = watcher.since(0);
    expect(batch.removed).toContain('gone.txt');
    expect([...batch.changed, ...batch.removed].some((p) => p.includes('.adl-cache'))).toBe(false);
    watcher.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it('returns fresh batches without false overflow on first poll', async () => {
    // 边界钉：首个批次 cursor=1 时 since(0) == oldest-1，无丢失不得误报 overflow。
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-watch-first-'));
    const watcher = new WorkspaceWatcher();
    watcher.start(root);
    writeFileSync(join(root, 'first.md'), 'one');
    await new Promise((resolve) => setTimeout(resolve, 900));
    const batch = watcher.since(0);
    expect(batch.changed).toContain('first.md');
    expect(batch.overflow ?? false).toBe(false);
    watcher.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it('recovers when the root appears after the first ensure', async () => {
    const root = join(tmpdir(), `adl-preview-watch-late-${process.pid}-${Date.now()}`);
    const first = workspaceWatchers.ensure(root);
    expect(first.isWatching()).toBe(false);

    mkdirSync(root, { recursive: true });
    const again = workspaceWatchers.ensure(root);
    expect(again.isWatching()).toBe(true);

    writeFileSync(join(root, 'late.md'), 'x');
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(again.since(0).changed).toContain('late.md');

    workspaceWatchers.dispose(root);
    rmSync(root, { recursive: true, force: true });
  });

  it('reports git metadata with synthetic .git/ paths (plain repo layout)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-watch-git-'));
    mkdirSync(join(root, '.git', 'refs', 'heads'), { recursive: true });
    mkdirSync(join(root, '.git', 'objects', 'pack'), { recursive: true });
    const watcher = new WorkspaceWatcher();
    watcher.start(root);
    writeFileSync(join(root, '.git', 'refs', 'heads', 'main'), 'ref');
    writeFileSync(join(root, '.git', 'index'), 'idx');
    writeFileSync(join(root, '.git', 'objects', 'pack', 'pack-1.idx'), 'pack');
    writeFileSync(join(root, 'src.txt'), 'keep');
    await new Promise((resolve) => setTimeout(resolve, 900));
    const batch = watcher.since(0);
    watcher.stop();
    rmSync(root, { recursive: true, force: true });
    expect(batch.changed).toContain('.git/refs/heads/main');
    expect(batch.changed).toContain('.git/index');
    expect(batch.changed).toContain('src.txt');
    // objects/** 不属于快照语义，必须被白名单过滤
    expect(batch.changed.some((p) => p.replace(/\\/g, '/').includes('objects'))).toBe(false);
  });

  it('re-resolves git watchers when the .git directory is recreated in place', async () => {
    // btime（birthtimeMs）不可得时指纹退级，跳过（平台能力差异）。
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-watch-recreate-'));
    mkdirSync(join(root, '.git', 'refs', 'heads'), { recursive: true });
    const probe = statSync(join(root, '.git'));
    if (!probe.birthtimeMs) {
      rmSync(root, { recursive: true, force: true });
      return;
    }
    const first = workspaceWatchers.ensure(root);
    writeFileSync(join(root, '.git', 'index'), 'idx');
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(first.since(0).changed).toContain('.git/index');
    // 游标固定：只检查游标之后的批次，锁定「.git 原位重建后 git 事件经 ensure
    // 轮询到达」的最小契约（不依赖旧句柄存活）。identityDrifted 分支由 Rust 侧
    // fixture 锁定；本平台旧句柄未替换时该断言仍可能绿，属已知保护边界。
    const cursor = first.since(0).cursor;

    rmSync(join(root, '.git'), { recursive: true, force: true });
    mkdirSync(join(root, '.git', 'refs'), { recursive: true });
    workspaceWatchers.ensure(root);
    writeFileSync(join(root, '.git', 'index'), 'idx2');
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(first.since(cursor).changed).toContain('.git/index');

    workspaceWatchers.dispose(root);
    rmSync(root, { recursive: true, force: true });
  });

  it('drops the stale gitdir watcher of a linked worktree whose main repo is gone', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-watch-stale-'));
    const main = mkdtempSync(join(tmpdir(), 'adl-preview-watch-stale-main-'));
    const gitdir = join(main, '.git', 'worktrees', 'stale-wt');
    mkdirSync(join(gitdir, 'logs'), { recursive: true });
    mkdirSync(join(main, '.git', 'refs'), { recursive: true });
    writeFileSync(join(gitdir, 'commondir'), '../..');
    writeFileSync(join(root, '.git'), `gitdir: ${gitdir}`);
    const first = workspaceWatchers.ensure(root);
    expect(first.gitWatcherCount()).toBe(2);

    // 主仓被删：gitdir 指针悬空；下次 ensure（轮询路径）应关闭死登记
    rmSync(main, { recursive: true, force: true });
    workspaceWatchers.ensure(root);
    expect(first.gitWatcherCount()).toBe(0);

    workspaceWatchers.dispose(root);
    rmSync(root, { recursive: true, force: true });
    rmSync(main, { recursive: true, force: true });
  });

  it('re-resolves git watchers when the .git layout drifts', async () => {
    // 首轮：plain repo → git 事件经根下 git watcher 上报合成路径
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-watch-drift-'));
    mkdirSync(join(root, '.git', 'refs', 'heads'), { recursive: true });
    const first = workspaceWatchers.ensure(root);
    writeFileSync(join(root, '.git', 'refs', 'heads', 'main'), 'ref');
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(first.since(0).changed).toContain('.git/refs/heads/main');

    // 布局漂移：plain → linked worktree（.git 变 gitdir 指针文件 + 主仓公共区）
    rmSync(join(root, '.git'), { recursive: true, force: true });
    const main = mkdtempSync(join(tmpdir(), 'adl-preview-watch-drift-main-'));
    const gitdir = join(main, '.git', 'worktrees', 'drift-wt');
    mkdirSync(join(gitdir, 'logs'), { recursive: true });
    mkdirSync(join(main, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(join(gitdir, 'commondir'), '../..');
    writeFileSync(join(root, '.git'), `gitdir: ${gitdir}`);

    // 模拟前端轮询再次 ensure → reconcile 重解析并替换 git watcher
    workspaceWatchers.ensure(root);
    writeFileSync(join(gitdir, 'HEAD'), 'ref: refs/heads/drift');
    writeFileSync(join(main, '.git', 'refs', 'heads', 'drift-branch'), 'sha');
    await new Promise((resolve) => setTimeout(resolve, 900));
    const batch = first.since(0);
    expect(batch.changed).toContain('.git/HEAD');
    expect(batch.changed).toContain('.git/refs/heads/drift-branch');

    workspaceWatchers.dispose(root);
    rmSync(root, { recursive: true, force: true });
    rmSync(main, { recursive: true, force: true });
  });

  it('resolves a linked worktree gitdir + commondir and reports their events', async () => {
    const root = mkdtempSync(join(tmpdir(), 'adl-preview-watch-wt-'));
    const mainRepo = mkdtempSync(join(tmpdir(), 'adl-preview-watch-main-'));
    const gitdir = join(mainRepo, '.git', 'worktrees', 'slot-x');
    const common = join(mainRepo, '.git');
    mkdirSync(join(gitdir, 'logs'), { recursive: true });
    mkdirSync(join(common, 'refs', 'heads'), { recursive: true });
    mkdirSync(join(common, 'logs', 'refs', 'heads'), { recursive: true });
    mkdirSync(join(common, 'objects'), { recursive: true });
    writeFileSync(join(gitdir, 'commondir'), '../..');
    writeFileSync(join(root, '.git'), `gitdir: ${gitdir}`);
    const watcher = new WorkspaceWatcher();
    watcher.start(root);
    writeFileSync(join(gitdir, 'HEAD'), 'ref: refs/heads/x');
    writeFileSync(join(common, 'refs', 'heads', 'x'), 'sha');
    writeFileSync(join(common, 'logs', 'refs', 'heads', 'x'), 'log');
    writeFileSync(join(common, 'objects', 'tmp_pack'), 'pack');
    await new Promise((resolve) => setTimeout(resolve, 900));
    const batch = watcher.since(0);
    watcher.stop();
    rmSync(root, { recursive: true, force: true });
    rmSync(mainRepo, { recursive: true, force: true });
    expect(batch.changed).toContain('.git/HEAD');
    expect(batch.changed).toContain('.git/refs/heads/x');
    expect(batch.changed).toContain('.git/logs/refs/heads/x');
    expect(batch.changed.some((p) => p.includes('objects'))).toBe(false);
  });
});
