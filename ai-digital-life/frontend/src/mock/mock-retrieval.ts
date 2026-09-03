import type { RetrievalBridge } from "../shared/ipc/retrieval";
import type { RepoMapNode } from "@ai-digital-life/kernel";
import { currentWorkspaceMeta } from "./mock-shared";

export const mockRetrieval: RetrievalBridge = {
  getStatus: async () => ({
    ok: true,
    data: currentWorkspaceMeta
      ? {
      workspaceId: currentWorkspaceMeta.id,
      rootPath: currentWorkspaceMeta.rootPath,
      status: "completed" as const,
      scannedFiles: 400,
      indexedTextFiles: 356,
      startedAt: Date.now() - 600_000,
      updatedAt: Date.now() - 300_000,
      completedAt: Date.now() - 300_000,
      topExtensions: [
        { extension: ".ts", count: 120 },
        { extension: ".tsx", count: 80 },
        { extension: ".css", count: 44 },
        { extension: ".md", count: 30 }
      ],
      repoMap: [
        { path: "frontend/src", type: "directory" as const },
        { path: "frontend/src/app", type: "directory" as const },
        { path: "frontend/src/kernel/index.ts", type: "file" as const }
      ]
    }
      : undefined
  }),
  getRepoMap: async () => ({
    ok: true,
    data: [
      {
        path: "frontend",
        name: "frontend",
        kind: "directory",
        fileCount: 66,
        primaryLanguage: "TypeScript",
        children: [
          { path: "frontend/src", name: "src", kind: "directory", fileCount: 60, primaryLanguage: "TypeScript", children: [] }
        ]
      },
      {
        path: "crates",
        name: "crates",
        kind: "directory",
        fileCount: 40,
        primaryLanguage: "Rust",
        children: [
          { path: "crates/kernel", name: "kernel", kind: "directory", fileCount: 5, primaryLanguage: "Rust", children: [] }
        ]
      },
      { path: "docs", name: "docs", kind: "directory", fileCount: 15, children: [] },
      { path: "README.md", name: "README.md", kind: "file", fileCount: 1, children: [] }
    ] satisfies RepoMapNode[]
  }),
  rebuildIndex: async () => ({ ok: true, data: true })
};