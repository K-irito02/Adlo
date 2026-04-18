import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@ai-digital-life/kernel": path.resolve(rootDir, "packages/kernel/src"),
      "@ai-digital-life/config": path.resolve(rootDir, "packages/config/src"),
      "@ai-digital-life/events": path.resolve(rootDir, "packages/events/src"),
      "@ai-digital-life/storage": path.resolve(rootDir, "packages/storage/src"),
      "@ai-digital-life/task": path.resolve(rootDir, "packages/task/src"),
      "@ai-digital-life/logger": path.resolve(rootDir, "packages/logger/src"),
      "@ai-digital-life/workspace": path.resolve(rootDir, "packages/workspace/src"),
      "@ai-digital-life/retrieval-worker": path.resolve(rootDir, "workers/health/src")
    }
  }
});
