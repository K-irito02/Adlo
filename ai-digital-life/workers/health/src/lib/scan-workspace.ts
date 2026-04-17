import fs from "node:fs/promises";
import path from "node:path";
import type { RepoMapEntry, RetrievalFileTypeCount, RetrievalSnapshot } from "@ai-digital-life/kernel";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".next", "coverage"]);
const TEXT_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".txt",
  ".css",
  ".scss",
  ".html",
  ".yml",
  ".yaml",
  ".py",
  ".rs",
  ".go",
  ".java"
]);

function createTopExtensions(entries: Map<string, number>): RetrievalFileTypeCount[] {
  return [...entries.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([extension, count]) => ({
      extension,
      count
    }));
}

export async function scanWorkspace(
  workspaceId: string,
  rootPath: string,
  progress: (snapshot: RetrievalSnapshot) => void,
  isCancelled: () => boolean
): Promise<RetrievalSnapshot> {
  const stack = [rootPath];
  const repoMap: RepoMapEntry[] = [];
  const extensionCounter = new Map<string, number>();
  let scannedFiles = 0;
  let indexedTextFiles = 0;
  const startedAt = Date.now();

  while (stack.length > 0) {
    if (isCancelled()) {
      throw new Error("Retrieval run cancelled.");
    }

    const currentDirectory = stack.pop()!;
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDirectory, entry.name);
      const relativePath = path.relative(rootPath, fullPath) || entry.name;

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          stack.push(fullPath);
          if (repoMap.length < 120) {
            repoMap.push({
              path: relativePath,
              type: "directory"
            });
          }
        }
        continue;
      }

      scannedFiles += 1;
      const extension = path.extname(entry.name).toLowerCase() || "<none>";
      extensionCounter.set(extension, (extensionCounter.get(extension) ?? 0) + 1);
      if (TEXT_FILE_EXTENSIONS.has(extension)) {
        indexedTextFiles += 1;
      }

      if (repoMap.length < 120) {
        repoMap.push({
          path: relativePath,
          type: "file"
        });
      }

      if (scannedFiles === 1 || scannedFiles % 25 === 0) {
        progress({
          workspaceId,
          rootPath,
          status: "running",
          scannedFiles,
          indexedTextFiles,
          startedAt,
          updatedAt: Date.now(),
          topExtensions: createTopExtensions(extensionCounter),
          repoMap: [...repoMap]
        });
      }
    }
  }

  return {
    workspaceId,
    rootPath,
    status: "completed",
    scannedFiles,
    indexedTextFiles,
    startedAt,
    updatedAt: Date.now(),
    completedAt: Date.now(),
    topExtensions: createTopExtensions(extensionCounter),
    repoMap
  };
}
