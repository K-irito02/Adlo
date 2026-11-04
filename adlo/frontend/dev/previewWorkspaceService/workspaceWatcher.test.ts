// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceWatcher } from './workspaceWatcher';

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
    const { mkdirSync } = await import('node:fs');
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
});
