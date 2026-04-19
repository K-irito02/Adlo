import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@ai-digital-life/kernel": path.resolve(rootDir, "packages/kernel/src"),
      "@ai-digital-life/config": path.resolve(rootDir, "packages/config/src"),
      "@ai-digital-life/errors": path.resolve(rootDir, "packages/errors/src"),
      "@ai-digital-life/events": path.resolve(rootDir, "packages/events/src"),
      "@ai-digital-life/migration": path.resolve(rootDir, "packages/migration/src"),
      "@ai-digital-life/storage": path.resolve(rootDir, "packages/storage/src"),
      "@ai-digital-life/task": path.resolve(rootDir, "packages/task/src"),
      "@ai-digital-life/logger": path.resolve(rootDir, "packages/logger/src"),
      "@ai-digital-life/workspace": path.resolve(rootDir, "packages/workspace/src"),
      "@ai-digital-life/model-gateway": path.resolve(rootDir, "packages/model-gateway/src"),
      "@ai-digital-life/prompt-engine": path.resolve(rootDir, "packages/prompt-engine/src"),
      "@ai-digital-life/context-engine": path.resolve(rootDir, "packages/context-engine/src"),
      "@ai-digital-life/fs-ops": path.resolve(rootDir, "packages/fs-ops/src"),
      "@ai-digital-life/change-engine": path.resolve(rootDir, "packages/change-engine/src"),
      "@ai-digital-life/conversation": path.resolve(rootDir, "packages/conversation/src"),
      "@ai-digital-life/agent-runtime": path.resolve(rootDir, "packages/agent-runtime/src"),
      "@ai-digital-life/terminal": path.resolve(rootDir, "packages/terminal/src"),
      "@ai-digital-life/editor": path.resolve(rootDir, "packages/editor/src"),
      "@ai-digital-life/retrieval-worker": path.resolve(rootDir, "workers/health/src")
    }
  }
});
