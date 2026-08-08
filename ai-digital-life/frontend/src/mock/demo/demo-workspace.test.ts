import { describe, it, expect } from 'vitest';
import {
  buildDemoWorkspaceMeta,
  buildDemoRecentEntry,
  buildDemoTree,
  buildDemoGitSnapshot,
  buildDemoChangePreview,
  getDemoPatchSet,
  buildDemoPatchSet,
} from './demo-workspace';
import {
  DEMO_WORKSPACE_ID,
  DEMO_WORKSPACE_PATH,
  DEMO_WORKSPACE_NAME_MARKER,
  DEMO_SESSION_IDS,
} from './demo-constants';

describe('demo-workspace', () => {
  it('builds a WorkspaceMeta for the demo path', () => {
    const meta = buildDemoWorkspaceMeta();
    expect(meta.id).toBe(DEMO_WORKSPACE_ID);
    expect(meta.path).toBe(DEMO_WORKSPACE_PATH);
    expect(meta.name).toBe(DEMO_WORKSPACE_NAME_MARKER);
    expect(meta.type).toBe('node');
    expect(meta.status).toBe('ready');
  });

  it('builds a pinned, available RecentWorkspaceEntry', () => {
    const entry = buildDemoRecentEntry();
    expect(entry.id).toBe(DEMO_WORKSPACE_ID);
    expect(entry.isPinned).toBe(true);
    expect(entry.pinnedOrder).toBe(0);
    expect(entry.available).toBe(true);
    expect(entry.removedFromSidebar).toBe(false);
    expect(entry.hiddenFromRightPanels).toBe(false);
  });

  it('builds a tree containing virtual documents', () => {
    const tree = buildDemoTree();
    const names = tree.map((node) => node.name);
    expect(names).toContain('frontend');
    expect(names).toContain('README.md');
  });

  it('builds a git snapshot with unstaged changes', () => {
    const snapshot = buildDemoGitSnapshot();
    expect(snapshot.isRepo).toBe(true);
    expect(snapshot.branch).toBe('main');
    expect(snapshot.unstaged).toContain('frontend/src/main.tsx');
  });

  it('builds a change preview for a document', () => {
    const preview = buildDemoChangePreview('frontend/src/main.tsx');
    expect(preview.changeKind).toBe('modified');
    expect(preview.currentContent).toContain('createRoot');
  });

  it('returns a patch set for the complete demo session run', () => {
    const patchSet = getDemoPatchSet('patchset-demo-complete');
    expect(patchSet?.id).toBe('patchset-demo-complete');
    expect(patchSet?.filePatches[0]?.relativePath).toBe('frontend/src/main.tsx');
  });

  it('returns undefined for unknown patch set ids', () => {
    expect(getDemoPatchSet('nope')).toBeUndefined();
  });

  it('builds a new patch set scoped to a session', () => {
    const ps = buildDemoPatchSet(DEMO_SESSION_IDS.complete, 'run-demo-1');
    expect(ps.sessionId).toBe(DEMO_SESSION_IDS.complete);
    expect(ps.runId).toBe('run-demo-1');
    expect(ps.filePatches.length).toBeGreaterThan(0);
  });
});
