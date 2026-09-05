// ────────────────────────────────────────────────────
//  Mock shared state — re-export hub
//  Domain-specific state lives in sibling modules:
//    mock-shared-pty.ts          PTY / terminal
//    mock-shared-workspace.ts    Workspace, documents, git, app, model
//    mock-shared-patch.ts        Patch sets, agent runs, send
// ────────────────────────────────────────────────────

// PTY / terminal
export {
  MAX_PTY_LISTENERS,
  ptyOutputListeners,
  activeMockPtySessions,
  emitPtyOutput,
  getMockPrompt,
  executeMockCommand,
} from "./mock-shared-pty";

// Workspace, documents, git, app info, model health
export {
  now,
  workspaceRoot,
  workspaceNameFromPath,
  buildWorkspaceTreeFromPaths,
  emptyDirectories,
  documents,
  fileVersions,
  appInfo,
  recentWorkspaces,
  currentWorkspaceMeta,
  type MockBridgeState,
  onMockStateChange,
  setOnMockStateChange,
  setMockCurrentWorkspace,
  activeWorkspaceScopeId,
  emptyGitSnapshot,
  buildMockChangePreview,
  ensureRecentWorkspace,
  buildMockWorkspaceMeta,
  modelHealth,
} from "./mock-shared-workspace";

// Patch sets, agent runs, send
export {
  activePatchSet,
  activeRun,
  setActivePatchSet,
  setActiveRun,
  createPatchSet,
} from "./mock-shared-patch";