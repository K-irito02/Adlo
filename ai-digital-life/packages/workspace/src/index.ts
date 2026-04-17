import fs from "node:fs";
import path from "node:path";
import {
  createWorkspaceId,
  normalizePath,
  type AppStateV1,
  type RecentWorkspaceEntry,
  type WorkspaceMeta,
  ValidationError,
  WorkspaceError
} from "@ai-digital-life/kernel";
import type { Logger } from "@ai-digital-life/logger";
import type { StateRepository } from "@ai-digital-life/storage";

const ROOT_MARKERS = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", ".git"];

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
  deduped.unshift(nextEntry);
  return deduped.slice(0, limit);
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
    }));
  }

  async open(workspacePath: string): Promise<WorkspaceMeta> {
    const resolvedPath = validateWorkspacePath(workspacePath);
    const rootPath = normalizePath(detectWorkspaceRoot(resolvedPath));
    const meta: WorkspaceMeta = {
      id: createWorkspaceId(rootPath),
      path: resolvedPath,
      rootPath,
      name: path.basename(rootPath),
      lastOpenedAt: Date.now(),
      status: "ready"
    };

    const recentEntry: RecentWorkspaceEntry = {
      id: meta.id,
      path: meta.path,
      rootPath: meta.rootPath,
      name: meta.name,
      lastOpenedAt: meta.lastOpenedAt,
      available: true
    };

    this.state = {
      ...this.state,
      currentWorkspacePath: meta.path,
      recentWorkspaces: upsertRecentWorkspace(this.state.recentWorkspaces, recentEntry, this.maxRecentWorkspaces)
    };

    await this.stateRepository.save(this.state);
    this.logger.info(`Workspace opened: ${meta.rootPath}`);
    return meta;
  }

  getCurrentWorkspace(): WorkspaceMeta | undefined {
    const currentPath = this.state.currentWorkspacePath;
    if (!currentPath || !fs.existsSync(currentPath)) {
      return undefined;
    }

    const rootPath = normalizePath(detectWorkspaceRoot(currentPath));
    return {
      id: createWorkspaceId(rootPath),
      path: currentPath,
      rootPath,
      name: path.basename(rootPath),
      lastOpenedAt: Date.now(),
      status: "ready"
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
}
