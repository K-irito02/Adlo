import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test-setup.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        include: ["src/**"],
        exclude: [
          "src/test-fixtures/**",
          "src/mock/**",
          "src/types/**",
          "src/shared/ipc-types.generated.ts",
          "src/**/*.test.ts",
          "src/**/*.test.tsx",
        ],
      },
    },
  })
);
