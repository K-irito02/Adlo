import { describe, it, expect } from 'vitest';
import { buildGitSnapshotSyncPatch } from './gitSnapshotSync';
import type { GitSnapshot, WorkspaceMeta } from '@ai-digital-life/kernel';

const snapshot = (overrides: Partial<GitSnapshot> = {}): GitSnapshot => ({
  isRepo: true,
  branch: 'main',
  staged: [],
  unstaged: [],
  untracked: [],
  conflicts: [],
  capturedAt: 123,
  ...overrides,
});

const currentWorkspace: WorkspaceMeta = {
  id: 'ws-current',
  path: '/current',
  rootPath: '/current',
  name: 'Current',
  type: 'unknown',
  status: 'ready',
  createdAt: 0,
  updatedAt: 0,
  lastOpenedAt: 0,
};

const state = (currentId: string | undefined, extraSlots: Record<string, GitSnapshot> = {}) =>
  ({
    appInfo: currentId
      ? ({
          appName: 'adl',
          version: '1',
          config: {} as never,
          recentLogs: [],
          currentWorkspace: { ...currentWorkspace, id: currentId },
        } as const)
      : undefined,
    gitSnapshots: {
      'ws-other': snapshot({ branch: 'other' }),
      ...extraSlots,
    },
    // StoreState is huge; the helper only touches appInfo + gitSnapshots,
    // so a minimal structural type is enough for the unit test.
  }) as never;

describe('buildGitSnapshotSyncPatch', () => {
  it('merges into gitSnapshots[workspaceId] (Source B) and leaves other slots untouched', () => {
    const unrelated = snapshot({ branch: 'keep-me' });
    const s = state('ws-current', { 'ws-unrelated': unrelated });
    const patch = buildGitSnapshotSyncPatch(s, {
      workspaceId: 'ws-other',
      snapshot: snapshot({ branch: 'feature' }),
    }) as { gitSnapshots: Record<string, GitSnapshot> };
    expect(patch.gitSnapshots['ws-other'].branch).toBe('feature');
    // Unrelated slots preserved by identity AND value (merge, not replace).
    expect(patch.gitSnapshots['ws-unrelated']).toBe(unrelated);
    // Returned map is a fresh reference (immutable update), not the input map.
    const inputMap = (s as { gitSnapshots: Record<string, GitSnapshot> }).gitSnapshots;
    expect(patch.gitSnapshots).not.toBe(inputMap);
  });

  it('does NOT touch Source A/C when the target is NOT the current workspace', () => {
    const s = state('ws-current');
    const patch = buildGitSnapshotSyncPatch(s, {
      workspaceId: 'ws-other',
      snapshot: snapshot(),
    });
    expect(patch).not.toHaveProperty('gitSnapshot');
    expect(patch).not.toHaveProperty('appInfo');
  });

  it('updates Source A (gitSnapshot) + C (currentWorkspace.gitSnapshot) when the target IS current', () => {
    const s = state('ws-current');
    const fresh = snapshot({ branch: 'release', capturedAt: 456 });
    const patch = buildGitSnapshotSyncPatch(s, {
      workspaceId: 'ws-current',
      snapshot: fresh,
    }) as {
      gitSnapshot: GitSnapshot;
      appInfo: { currentWorkspace: WorkspaceMeta };
    };
    expect(patch.gitSnapshot.branch).toBe('release');
    expect(patch.appInfo.currentWorkspace.gitSnapshot?.branch).toBe('release');
    expect(patch.appInfo.currentWorkspace.id).toBe('ws-current');
    // C preserves other currentWorkspace metadata (name etc.)
    expect(patch.appInfo.currentWorkspace.name).toBe('Current');
  });

  it('uses workspaceMeta as the C base when provided and pins gitSnapshot to the authoritative snapshot', () => {
    const s = state('ws-current');
    const staleMeta: WorkspaceMeta = {
      ...currentWorkspace,
      id: 'ws-current',
      name: 'Renamed',
      gitSnapshot: snapshot({ branch: 'stale' }),
    };
    const patch = buildGitSnapshotSyncPatch(s, {
      workspaceId: 'ws-current',
      snapshot: snapshot({ branch: 'fresh' }),
      workspaceMeta: staleMeta,
    }) as {
      gitSnapshot: GitSnapshot;
      appInfo: { currentWorkspace: WorkspaceMeta };
    };
    // workspaceMeta refreshed the name (switch/create return updated metadata)…
    expect(patch.appInfo.currentWorkspace.name).toBe('Renamed');
    // …but C.gitSnapshot is pinned to the authoritative snapshot, not staleMeta's.
    expect(patch.appInfo.currentWorkspace.gitSnapshot?.branch).toBe('fresh');
    expect(patch.gitSnapshot.branch).toBe('fresh');
  });

  it('handles a missing appInfo (no current workspace): only Source B is written', () => {
    const s = state(undefined);
    const patch = buildGitSnapshotSyncPatch(s, {
      workspaceId: 'orphan',
      snapshot: snapshot(),
    });
    expect(patch).toHaveProperty('gitSnapshots');
    expect(patch).not.toHaveProperty('gitSnapshot');
    expect(patch).not.toHaveProperty('appInfo');
  });

  it('ignores workspaceMeta when the target is NOT current (switch/create mid-await path): only B is written', () => {
    const s = state('ws-current');
    const patch = buildGitSnapshotSyncPatch(s, {
      workspaceId: 'ws-other',
      snapshot: snapshot({ branch: 'foreign' }),
      workspaceMeta: { ...currentWorkspace, id: 'ws-other', name: 'ShouldBeIgnored' },
    });
    // B updated…
    expect(
      (patch as { gitSnapshots: Record<string, GitSnapshot> }).gitSnapshots['ws-other'].branch,
    ).toBe('foreign');
    // …workspaceMeta NOT applied to currentWorkspace; A/C untouched.
    expect(patch).not.toHaveProperty('gitSnapshot');
    expect(patch).not.toHaveProperty('appInfo');
  });

  it('does not touch A/C when appInfo exists but currentWorkspace is undefined', () => {
    const s = state(undefined);
    // Simulate appInfo present with no current workspace by overriding the factory.
    const withAppInfoNoCurrent = {
      ...(s as { appInfo?: unknown }),
      appInfo: {
        appName: 'adl',
        version: '1',
        config: {} as never,
        recentLogs: [],
        currentWorkspace: undefined,
      },
    } as never;
    const patch = buildGitSnapshotSyncPatch(withAppInfoNoCurrent, {
      workspaceId: 'any-ws',
      snapshot: snapshot(),
    });
    expect(patch).toHaveProperty('gitSnapshots');
    expect(patch).not.toHaveProperty('gitSnapshot');
    expect(patch).not.toHaveProperty('appInfo');
  });
});
