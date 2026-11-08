// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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
});
