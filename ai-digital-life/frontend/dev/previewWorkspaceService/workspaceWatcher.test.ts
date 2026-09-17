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
});
