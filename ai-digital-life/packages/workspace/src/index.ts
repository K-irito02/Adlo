import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  APPROVAL_POLICY_MODE,
  type GitSnapshot,
  type ReorderWorkspacesInput,
  type SessionMeta,
  type SessionSummary,
  createWorkspaceId,
  createId,
  normalizePath,
  type AppStateV1,
  type RecentWorkspaceEntry,
  type WorkspaceMeta,
  type WorkspaceType,
  ValidationError,
  WorkspaceError
} from "@ai-digital-life/kernel";
import type { Logger } from "@ai-digital-life/logger";
import type { StateRepository } from "@ai-digital-life/storage";

const ROOT_MARKERS = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", ".git"];

export function detectWorkspaceType(rootPath: string): WorkspaceType {
  if (fs.existsSync(path.join(rootPath, "package.json"))) {
    return "node";
  }
  if (fs.existsSync(path.join(rootPath, "pyproject.toml"))) {
    return "python";
  }
  if (fs.existsSync(path.join(rootPath, "pom.xml"))) {
    return "java";
  }
  if (fs.existsSync(path.join(rootPath, "go.mod"))) {
    return "go";
  }
  if (fs.existsSync(path.join(rootPath, "Cargo.toml"))) {
    return "rust";
  }
  return "unknown";
}

export function captureGitSnapshot(rootPath: string): GitSnapshot {
  const capturedAt = Date.now();
  if (!fs.existsSync(path.join(rootPath, ".git"))) {
    return {
      isRepo: false,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
      capturedAt
    };
  }

  try {
    const output = execFileSync("git", ["-C", rootPath, "status", "--porcelain=1", "-b"], {
      encoding: "utf8",
      windowsHide: true
    });
    const lines = output.split(/\r?\n/).filter(Boolean);
    const header = lines[0] ?? "";
    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];
    const conflicts: string[] = [];
    let branch: string | undefined;
    let head: string | undefined;
    let ahead = 0;
    let behind = 0;

    if (header.startsWith("## ")) {
      const branchInfo = header.slice(3);
      const [namePart, trackingPart] = branchInfo.split("...");
      branch = namePart || undefined;
      head = branch;

      const counts = trackingPart?.match(/ahead (\d+)/);
      if (counts) {
        ahead = Number(counts[1]);
      }
      const behindMatch = trackingPart?.match(/behind (\d+)/);
      if (behindMatch) {
        behind = Number(behindMatch[1]);
      }
    }

    for (const line of lines.slice(1)) {
      const x = line[0];
      const y = line[1];
      const filePath = line.slice(3).trim();
      if (!filePath) {
        continue;
      }

      if (x === "?" && y === "?") {
        untracked.push(filePath);
        continue;
      }

      if (["AU", "UD", "DU", "AA", "UU", "DD", "UA"].includes(`${x}${y}`)) {
        conflicts.push(filePath);
        continue;
      }

      if (x !== " ") {
        staged.push(filePath);
      }
      if (y !== " ") {
        unstaged.push(filePath);
      }
    }

    return {
      isRepo: true,
      branch,
      head,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      conflicts,
      capturedAt
    };
  } catch {
    return {
      isRepo: true,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
      capturedAt
    };
  }
}

export function detectWorkspaceRoot(startPath: string): string {
  let current = path.resolve(startPath);

  while (true) {
    for (const marker of ROOT_MARKERS) {
      if (fs.existsSync(path.join(current, marker))) {
        return current;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startPath);
    }
    current = parent;
  }
}

export function validateWorkspacePath(candidatePath: string): string {
  if (!candidatePath.trim()) {
    throw new ValidationError("Workspace path cannot be empty.");
  }

  const resolvedPath = path.resolve(candidatePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new WorkspaceError("Workspace path does not exist.");
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new WorkspaceError("Workspace path must point to a directory.");
  }

  return normalizePath(resolvedPath);
}

export function upsertRecentWorkspace(
  recents: RecentWorkspaceEntry[],
  nextEntry: RecentWorkspaceEntry,
  limit: number
): RecentWorkspaceEntry[] {
  const deduped = recents.filter((entry) => entry.path !== nextEntry.path);
  const existing = recents.find((entry) => entry.path === nextEntry.path);
  const candidate: RecentWorkspaceEntry = {
    ...nextEntry,
    isPinned: existing?.isPinned ?? nextEntry.isPinned,
    pinnedOrder: existing?.pinnedOrder ?? nextEntry.pinnedOrder,
    unpinnedOrder: existing?.unpinnedOrder ?? nextEntry.unpinnedOrder,
    removedFromSidebar: false
  };
  deduped.unshift(candidate);
  let pinnedOrder = 0;
  let unpinnedOrder = 0;
  return deduped.slice(0, limit).map((entry) => {
    if (entry.isPinned) {
      return {
        ...entry,
        pinnedOrder: pinnedOrder++,
        unpinnedOrder: 0
      };
    }
    return {
      ...entry,
      pinnedOrder: 0,
      unpinnedOrder: unpinnedOrder++
    };
  });
}

export class WorkspaceService {
  private readonly stateRepository: StateRepository;
  private readonly logger: Logger;
  private readonly maxRecentWorkspaces: number;
  private state: AppStateV1;

  constructor(options: {
    stateRepository: StateRepository;
    logger: Logger;
    maxRecentWorkspaces: number;
    initialState: AppStateV1;
  }) {
    this.stateRepository = options.stateRepository;
    this.logger = options.logger;
    this.maxRecentWorkspaces = options.maxRecentWorkspaces;
    this.state = options.initialState;
  }

  getState(): AppStateV1 {
    return this.state;
  }

  async listRecent(): Promise<RecentWorkspaceEntry[]> {
    return this.state.recentWorkspaces.map((entry) => ({
      ...entry,
      available: fs.existsSync(entry.path)
    })).filter((entry) => !entry.removedFromSidebar);
  }

  async open(workspacePath: string): Promise<WorkspaceMeta> {
    const resolvedPath = validateWorkspacePath(workspacePath);
    const rootPath = normalizePath(detectWorkspaceRoot(resolvedPath));
    const now = Date.now();
    const existingWorkspace = await this.stateRepository.getWorkspace(createWorkspaceId(rootPath));
    const meta: WorkspaceMeta = {
      id: createWorkspaceId(rootPath),
      path: resolvedPath,
      rootPath,
      name: path.basename(rootPath),
      type: detectWorkspaceType(rootPath),
      status: "ready",
      gitSnapshot: captureGitSnapshot(rootPath),
      createdAt: existingWorkspace?.createdAt ?? now,
      updatedAt: now,
      lastOpenedAt: now
    };

    const recentEntry: RecentWorkspaceEntry = {
      id: meta.id,
      path: meta.path,
      rootPath: meta.rootPath,
      name: meta.name,
      lastOpenedAt: meta.lastOpenedAt,
      isPinned: existingWorkspace ? this.state.recentWorkspaces.find((entry) => entry.id === meta.id)?.isPinned ?? false : false,
      pinnedOrder: this.state.recentWorkspaces.find((entry) => entry.id === meta.id)?.pinnedOrder ?? 0,
      unpinnedOrder: this.state.recentWorkspaces.find((entry) => entry.id === meta.id)?.unpinnedOrder ?? this.state.recentWorkspaces.filter((entry) => !entry.isPinned).length,
      removedFromSidebar: false,
      available: true
    };

    this.state = {
      ...this.state,
      currentWorkspacePath: meta.path,
      recentWorkspaces: upsertRecentWorkspace(this.state.recentWorkspaces, recentEntry, this.maxRecentWorkspaces)
    };

    await this.stateRepository.save(this.state);
    await this.stateRepository.upsertWorkspace(meta);
    const session = await this.ensureSession(meta.id);
    await this.stateRepository.upsertSession({
      ...session,
      updatedAt: now
    });
    await this.stateRepository.appendAuditRecord({
      entityType: "workspace",
      entityId: meta.id,
      action: "workspace.opened",
      detail: `Opened workspace ${meta.rootPath}`,
      createdAt: now
    });
    this.logger.info(`Workspace opened: ${meta.rootPath}`);
    return meta;
  }

  getCurrentWorkspace(): WorkspaceMeta | undefined {
    const currentPath = this.state.currentWorkspacePath;
    if (!currentPath || !fs.existsSync(currentPath)) {
      return undefined;
    }

    const rootPath = normalizePath(detectWorkspaceRoot(currentPath));
    const now = Date.now();
    return {
      id: createWorkspaceId(rootPath),
      path: currentPath,
      rootPath,
      name: path.basename(rootPath),
      type: detectWorkspaceType(rootPath),
      status: "ready",
      gitSnapshot: captureGitSnapshot(rootPath),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now
    };
  }

  async updateWindowState(statePatch: AppStateV1["windowState"]): Promise<void> {
    this.state = {
      ...this.state,
      windowState: statePatch
    };
    await this.stateRepository.save(this.state);
  }

  getCurrentWorkspaceId(): string | undefined {
    return this.getCurrentWorkspace()?.id;
  }

  async getCurrentSession(): Promise<SessionMeta | undefined> {
    const workspaceId = this.getCurrentWorkspaceId();
    if (!workspaceId) {
      return undefined;
    }

    return this.stateRepository.getLatestSession(workspaceId);
  }

  async ensureSession(workspaceId: string): Promise<SessionMeta> {
    const existing = await this.stateRepository.getLatestSession(workspaceId);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const session: SessionMeta = {
      id: createId("session"),
      workspaceId,
      status: "active",
      approvalMode: APPROVAL_POLICY_MODE,
      summary: {},
      createdAt: now,
      updatedAt: now
    };
    await this.stateRepository.upsertSession(session);
    return session;
  }

  async updateSessionSummary(workspaceId: string, summaryPatch: Partial<SessionSummary>, currentTaskId?: string): Promise<SessionMeta> {
    const session = await this.ensureSession(workspaceId);
    const nextSession: SessionMeta = {
      ...session,
      currentTaskId: currentTaskId ?? session.currentTaskId,
      summary: {
        ...session.summary,
        ...summaryPatch
      },
      updatedAt: Date.now()
    };
    await this.stateRepository.upsertSession(nextSession);
    return nextSession;
  }

  async pinWorkspace(workspaceId: string): Promise<RecentWorkspaceEntry[]> {
    const nextEntries = await this.stateRepository.pinRecentWorkspace(workspaceId);
    this.state = { ...this.state, recentWorkspaces: nextEntries };
    return this.listRecent();
  }

  async unpinWorkspace(workspaceId: string): Promise<RecentWorkspaceEntry[]> {
    const nextEntries = await this.stateRepository.unpinRecentWorkspace(workspaceId);
    this.state = { ...this.state, recentWorkspaces: nextEntries };
    return this.listRecent();
  }

  async reorderWorkspaces(input: ReorderWorkspacesInput): Promise<RecentWorkspaceEntry[]> {
    const nextEntries = await this.stateRepository.reorderRecentWorkspaces(input);
    this.state = { ...this.state, recentWorkspaces: nextEntries };
    return this.listRecent();
  }

  async removeWorkspaceFromSidebar(workspaceId: string): Promise<RecentWorkspaceEntry[]> {
    const nextEntries = await this.stateRepository.removeRecentWorkspaceFromSidebar(workspaceId);
    this.state = { ...this.state, recentWorkspaces: nextEntries };
    return this.listRecent();
  }

  async restoreWorkspaceToSidebar(workspaceId: string): Promise<RecentWorkspaceEntry[]> {
    const nextEntries = await this.stateRepository.restoreRecentWorkspaceToSidebar(workspaceId);
    this.state = { ...this.state, recentWorkspaces: nextEntries };
    return this.listRecent();
  }
}
