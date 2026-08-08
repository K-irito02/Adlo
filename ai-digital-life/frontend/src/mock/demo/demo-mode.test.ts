import { describe, it, expect, beforeEach } from 'vitest';
import type { DigitalLifeBridge } from '../../shared/ipc/digital-life';
import { withDemoMode, isDemoActive, resetDemoModeForTest } from './demo-mode';
import { DEMO_WORKSPACE_ID, DEMO_WORKSPACE_PATH } from './demo-constants';
import { DEMO_SESSION_IDS } from './demo-constants';

function makeBaseBridge(): DigitalLifeBridge {
  const conversation: DigitalLifeBridge['conversation'] = {
    createSession: async () => ({ ok: true, data: { id: 'session-real', workspaceId: 'ws-real', title: 'real', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    listSessions: async () => ({ ok: true, data: [{ id: 'session-real', workspaceId: 'ws-real', title: 'real', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 }] }),
    getSession: async () => ({ ok: true, data: undefined }),
    renameSession: async (input) => ({ ok: true, data: { id: input.sessionId, workspaceId: 'ws', title: input.title, status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    pinSession: async (id) => ({ ok: true, data: { id, workspaceId: 'ws', title: 't', status: 'active', isPinned: true, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    unpinSession: async (id) => ({ ok: true, data: { id, workspaceId: 'ws', title: 't', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    reorderSessions: async () => ({ ok: true, data: [] }),
    markSessionRead: async (input) => ({ ok: true, data: { id: input.sessionId, workspaceId: 'ws', title: 't', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    markSessionUnread: async (id) => ({ ok: true, data: { id, workspaceId: 'ws', title: 't', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    archiveSession: async (id) => ({ ok: true, data: { id, workspaceId: 'ws', title: 't', status: 'archived', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, archivedAt: 0, createdAt: 0, updatedAt: 0, lastMessageAt: 0 } }),
    archiveAllInWorkspace: async () => ({ ok: true, data: [] }),
    deleteSession: async () => ({ ok: true, data: true }),
    sendMessage: async (input) => ({ ok: true, data: { session: { id: input.sessionId, workspaceId: 'ws', title: 't', status: 'active', isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, manualUnread: false, createdAt: 0, updatedAt: 0, lastMessageAt: 0 }, userMessage: { id: 'u', sessionId: input.sessionId, role: 'user', content: input.content, blocks: [], createdAt: 0 }, assistantMessage: { id: 'a', sessionId: input.sessionId, role: 'assistant', content: 'a', blocks: [], createdAt: 0 }, runDetail: { run: { id: 'r', workspaceId: 'ws', sessionId: input.sessionId, prompt: '', scenario: 'chat', status: 'succeeded', createdAt: 0, updatedAt: 0 }, steps: [] } } }),
    cancelMessage: async () => ({ ok: true, data: undefined }),
  };
  return {
    subscribeModelStream: () => () => {},
    subscribeRunActivity: () => () => {},
    subscribeTerminalStream: () => () => {},
    subscribePtyOutput: () => () => {},
    setLogMode: async () => {},
    window: {} as DigitalLifeBridge['window'],
    app: { getInfo: async () => ({ ok: true, data: { appName: 'real', version: '0', config: {} } as never }), getHealth: async () => ({ ok: true, data: {} as never }), getDiagnostics: async () => ({ ok: true, data: {} as never }), getModelHealth: async () => ({ ok: true, data: {} as never }), updatePreferences: async () => ({ ok: true, data: {} as never }) },
    workspace: {
      listRecent: async () => ({ ok: true, data: [{ id: 'ws-real', path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false }] }),
      open: async () => ({ ok: true, data: { id: 'ws-real', path: '/real', rootPath: '/real', name: 'real', type: 'node', status: 'ready', createdAt: 0, updatedAt: 0, lastOpenedAt: 0 } }),
      clearCurrent: async () => ({ ok: true, data: true }),
      pickDirectory: async () => ({ ok: true, data: undefined }),
      pin: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: true, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false }] }),
      unpin: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false }] }),
      reorder: async () => ({ ok: true, data: [] }),
      removeFromSidebar: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: true, available: true, hiddenFromRightPanels: true }] }),
      restoreToSidebar: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false }] }),
      listTreeForWorkspace: async () => ({ ok: true, data: [] }),
      listGitStatusForWorkspace: async () => ({ ok: true, data: { isRepo: false, staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 } }),
      hideFromRightPanels: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: true }] }),
      showInRightPanels: async (id) => ({ ok: true, data: [{ id, path: '/real', rootPath: '/real', name: 'real', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false }] }),
      revealInFileManager: async () => ({ ok: true, data: true }),
      createFile: async () => ({ ok: true, data: { path: 'x', content: '', lastModifiedAt: 0 } }),
      createFolder: async () => ({ ok: true, data: true }),
      readFile: async () => ({ ok: true, data: { path: 'x', content: '', lastModifiedAt: 0 } }),
      readFileForWorkspace: async () => ({ ok: true, data: { path: 'x', content: '', lastModifiedAt: 0 } }),
      getChangePreview: async () => ({ ok: true, data: { path: 'x', changeKind: 'modified', status: 'modified', baseExists: true, currentExists: true, baseContent: '', currentContent: '' } }),
      getChangePreviewForWorkspace: async () => ({ ok: true, data: { path: 'x', changeKind: 'modified', status: 'modified', baseExists: true, currentExists: true, baseContent: '', currentContent: '' } }),
      listTree: async () => ({ ok: true, data: [] }),
      search: async () => ({ ok: true, data: [] }),
      outline: async () => ({ ok: true, data: [] }),
      setEditorDirtyPaths: async () => ({ ok: true, data: true }),
      renameFile: async () => ({ ok: true, data: true }),
      deleteFile: async () => ({ ok: true, data: true }),
      duplicateFile: async () => ({ ok: true, data: true }),
      getAbsolutePath: async () => ({ ok: true, data: '' }),
      moveFile: async () => ({ ok: true, data: true }),
      getGitStatus: async () => ({ ok: true, data: { isRepo: false, staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 } }),
      listGitBranches: async () => ({ ok: true, data: [] }),
      switchGitBranch: async () => ({ ok: true, data: { workspace: { id: 'ws', path: '/r', rootPath: '/r', name: 'r', type: 'node', status: 'ready', createdAt: 0, updatedAt: 0, lastOpenedAt: 0 }, gitSnapshot: { isRepo: false, staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 }, currentBranch: 'main', stashedChanges: false, hasRestored: false } }),
      createGitBranch: async () => ({ ok: true, data: { workspace: { id: 'ws', path: '/r', rootPath: '/r', name: 'r', type: 'node', status: 'ready', createdAt: 0, updatedAt: 0, lastOpenedAt: 0 }, gitSnapshot: { isRepo: false, staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: 0 }, currentBranch: 'main', stashedChanges: false, hasRestored: false } }),
      stageFile: async () => ({ ok: true, data: undefined }),
      unstageFile: async () => ({ ok: true, data: undefined }),
      discardFile: async () => ({ ok: true, data: undefined }),
      gitVisCommitStats: async () => ({ ok: true, data: {} as never }),
      gitVisCodeEvolution: async () => ({ ok: true, data: {} as never }),
      gitVisContributorModules: async () => ({ ok: true, data: {} as never }),
      gitVisBranchGraph: async () => ({ ok: true, data: {} as never }),
      gitVisFileHotspots: async () => ({ ok: true, data: {} as never }),
      gitVisFirstCommitYear: async () => ({ ok: true, data: 0 }),
      onFileChanged: () => () => {},
    },
    retrieval: {} as DigitalLifeBridge['retrieval'],
    conversation,
    agent: {} as DigitalLifeBridge['agent'],
    subagent: {} as DigitalLifeBridge['subagent'],
    mcp: {} as DigitalLifeBridge['mcp'],
    patch: {
      getPatchSet: async () => ({ ok: true, data: undefined }),
      setHunkDecision: async () => ({ ok: true, data: { id: 'p', workspaceId: 'w', sessionId: 's', title: 't', summary: 's', status: 'ready', createdAt: 0, updatedAt: 0, filePatches: [] } }),
      applyPatchSet: async () => ({ ok: true, data: { patchSet: { id: 'p', workspaceId: 'w', sessionId: 's', title: 't', summary: 's', status: 'applied', createdAt: 0, updatedAt: 0, filePatches: [] }, rolledBack: false } }),
      rollbackPatchSet: async () => ({ ok: true, data: { id: 'p', workspaceId: 'w', sessionId: 's', title: 't', summary: 's', status: 'rolled-back', createdAt: 0, updatedAt: 0, filePatches: [] } }),
    },
    provider: {} as DigitalLifeBridge['provider'],
    command: {} as DigitalLifeBridge['command'],
    pty: {} as DigitalLifeBridge['pty'],
    task: {} as DigitalLifeBridge['task'],
    runActivity: { listByRunId: async () => ({ ok: true, data: [] }) },
    browser: {} as DigitalLifeBridge['browser'],
    github: {} as DigitalLifeBridge['github'],
    snapshot: {} as DigitalLifeBridge['snapshot'],
    webTools: { webFetch: async () => ({ ok: true, data: { url: '', status: 200, content_type: null, content: '', truncated: false, format: 'markdown', error: null } }), webSearch: async () => ({ ok: true, data: { query: '', results: [], error: null } }) },
    commandsConfig: {} as DigitalLifeBridge['commandsConfig'],
    permission: {} as DigitalLifeBridge['permission'],
    compaction: {} as DigitalLifeBridge['compaction'],
    sessionFork: {} as DigitalLifeBridge['sessionFork'],
    lsp: {} as DigitalLifeBridge['lsp'],
    reference: {} as DigitalLifeBridge['reference'],
    durable: {} as DigitalLifeBridge['durable'],
    reserved: {} as DigitalLifeBridge['reserved'],
    customAgent: {} as DigitalLifeBridge['customAgent'],
  };
}

describe('withDemoMode', () => {
  beforeEach(() => {
    resetDemoModeForTest();
  });

  it('passes through when inactive', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    expect(isDemoActive()).toBe(false);
    const recent = await bridge.workspace.listRecent();
    expect(recent.ok && recent.data[0]?.id).toBe(DEMO_WORKSPACE_ID);
    expect(recent.ok && recent.data.some((entry) => entry.id === 'ws-real')).toBe(true);
  });

  it('prepends the demo entry to listRecent even when inactive', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    const recent = await bridge.workspace.listRecent();
    expect(recent.ok && recent.data[0]?.id).toBe(DEMO_WORKSPACE_ID);
    expect(recent.ok && recent.data[0]?.name).toContain('i18n:');
  });

  it('activates demo mode when opening the demo path and returns demo data', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    const result = await bridge.workspace.open(DEMO_WORKSPACE_PATH);
    expect(result.ok && result.data.id).toBe(DEMO_WORKSPACE_ID);
    expect(isDemoActive()).toBe(true);

    const sessions = await bridge.conversation.listSessions();
    expect(sessions.ok && sessions.data.map((s) => s.id)).toEqual(
      expect.arrayContaining(Object.values(DEMO_SESSION_IDS)),
    );

    const detail = await bridge.conversation.getSession(DEMO_SESSION_IDS.complete);
    expect(detail.ok && detail.data?.session.id).toBe(DEMO_SESSION_IDS.complete);
    expect(detail.ok && (detail.data?.messages.length ?? 0)).toBeGreaterThan(0);
  });

  it('deactivates demo mode when opening a non-demo path', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    await bridge.workspace.open(DEMO_WORKSPACE_PATH);
    expect(isDemoActive()).toBe(true);
    await bridge.workspace.open('/real/other');
    expect(isDemoActive()).toBe(false);
  });

  it('ignores demo-mode toggling when clearCurrent is called', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    await bridge.workspace.open(DEMO_WORKSPACE_PATH);
    expect(isDemoActive()).toBe(true);
    const cleared = await bridge.workspace.clearCurrent();
    expect(cleared.ok).toBe(true);
    expect(isDemoActive()).toBe(false);
  });

  it('returns demo run activity when active', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    await bridge.workspace.open(DEMO_WORKSPACE_PATH);
    const activity = await bridge.runActivity.listByRunId('run-demo-complete');
    expect(activity.ok && activity.data.length).toBeGreaterThan(0);
  });

  it('returns demo patch sets when active', async () => {
    const bridge = withDemoMode(makeBaseBridge());
    await bridge.workspace.open(DEMO_WORKSPACE_PATH);
    const patchSet = await bridge.patch.getPatchSet('patchset-demo-complete');
    expect(patchSet.ok && patchSet.data?.id).toBe('patchset-demo-complete');
  });
});
