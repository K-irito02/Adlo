import fs from "node:fs/promises";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import {
  type FileOutlineItem,
  type WorkspaceFileChangedEvent,
  type WorkspaceSearchHit,
  ValidationError,
  WorkspaceError,
  normalizePath
} from "@ai-digital-life/kernel";

function isInsideWorkspace(rootPath: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

function assertWorkspacePath(rootPath: string, relativePath: string): string {
  const normalizedRelative = normalizePath(relativePath);
  if (!normalizedRelative || normalizedRelative === ".") {
    throw new ValidationError("Relative path is required.");
  }

  const absolutePath = path.resolve(rootPath, normalizedRelative);
  if (!isInsideWorkspace(rootPath, absolutePath)) {
    throw new WorkspaceError("Path escapes the active workspace.");
  }
  return absolutePath;
}

async function walkDirectory(rootPath: string, currentPath: string, files: string[]): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }

    const nextPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(rootPath, nextPath, files);
      continue;
    }
    files.push(path.relative(rootPath, nextPath).replaceAll("\\", "/"));
  }
}

export class WorkspaceFsService {
  async readDocument(rootPath: string, relativePath: string): Promise<{ content: string; lastModifiedAt: number }> {
    const absolutePath = assertWorkspacePath(rootPath, relativePath);
    const [content, stats] = await Promise.all([
      fs.readFile(absolutePath, "utf8"),
      fs.stat(absolutePath)
    ]);
    return {
      content,
      lastModifiedAt: stats.mtimeMs
    };
  }

  async listFiles(rootPath: string): Promise<string[]> {
    const files: string[] = [];
    await walkDirectory(rootPath, rootPath, files);
    return files.sort();
  }

  async readFile(rootPath: string, relativePath: string): Promise<string> {
    const document = await this.readDocument(rootPath, relativePath);
    return document.content;
  }

  async search(rootPath: string, query: string, limit = 20): Promise<WorkspaceSearchHit[]> {
    if (!query.trim()) {
      return [];
    }

    const files = await this.listFiles(rootPath);
    const hits: WorkspaceSearchHit[] = [];

    for (const relativePath of files) {
      if (hits.length >= limit) {
        break;
      }

      const absolutePath = path.join(rootPath, relativePath);
      const content = await fs.readFile(absolutePath, "utf8").catch(() => "");
      if (!content) {
        continue;
      }

      const lines = content.split(/\r?\n/);
      lines.some((lineText, index) => {
        if (!lineText.toLowerCase().includes(query.toLowerCase())) {
          return false;
        }
        hits.push({
          path: relativePath,
          line: index + 1,
          preview: lineText.trim()
        });
        return hits.length >= limit;
      });
    }

    return hits;
  }

  async outline(rootPath: string, relativePath: string): Promise<FileOutlineItem[]> {
    const content = await this.readFile(rootPath, relativePath);
    return content.split(/\r?\n/).flatMap((lineText, index) => {
      const lineNumber = index + 1;
      const trimmed = lineText.trim();

      const patterns: Array<[FileOutlineItem["kind"], RegExp]> = [
        ["class", /^(?:export\s+)?class\s+([A-Za-z0-9_]+)/],
        ["function", /^(?:export\s+)?function\s+([A-Za-z0-9_]+)/],
        ["interface", /^(?:export\s+)?interface\s+([A-Za-z0-9_]+)/],
        ["type", /^(?:export\s+)?type\s+([A-Za-z0-9_]+)/],
        ["const", /^(?:export\s+)?const\s+([A-Za-z0-9_]+)/],
        ["heading", /^(#+)\s+(.+)/]
      ];

      for (const [kind, pattern] of patterns) {
        const match = trimmed.match(pattern);
        if (!match) {
          continue;
        }

        const label = kind === "heading" ? match[2] : match[1];
        return [
          {
            id: `${relativePath}:${lineNumber}:${kind}`,
            label,
            kind,
            line: lineNumber
          }
        ];
      }

      return [];
    });
  }

  async atomicWrite(rootPath: string, relativePath: string, content: string): Promise<void> {
    const absolutePath = assertWorkspacePath(rootPath, relativePath);
    const tempPath = `${absolutePath}.tmp-${Date.now()}`;
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, absolutePath);
  }
}

export class WorkspaceWatcherService {
  private watcher?: FSWatcher;
  private activeRootPath?: string;

  async watch(
    rootPath: string,
    onChange: (event: WorkspaceFileChangedEvent) => Promise<void> | void
  ): Promise<void> {
    if (this.activeRootPath === rootPath && this.watcher) {
      return;
    }

    await this.close();
    this.activeRootPath = rootPath;
    this.watcher = chokidar.watch(rootPath, {
      ignoreInitial: true,
      ignored: [
        /(^|[\\/])\.git([\\/]|$)/,
        /(^|[\\/])node_modules([\\/]|$)/,
        /(^|[\\/])dist([\\/]|$)/
      ]
    });

    const emitChange = async (absolutePath: string) => {
      if (!isInsideWorkspace(rootPath, absolutePath)) {
        return;
      }

      const stats = await fs.stat(absolutePath).catch(() => undefined);
      if (!stats?.isFile()) {
        return;
      }

      await onChange({
        path: path.relative(rootPath, absolutePath).replaceAll("\\", "/"),
        lastModifiedAt: stats.mtimeMs
      });
    };

    this.watcher.on("change", (absolutePath) => {
      void emitChange(absolutePath);
    });
    this.watcher.on("add", (absolutePath) => {
      void emitChange(absolutePath);
    });
  }

  async close(): Promise<void> {
    await this.watcher?.close();
    this.watcher = undefined;
    this.activeRootPath = undefined;
  }
}
