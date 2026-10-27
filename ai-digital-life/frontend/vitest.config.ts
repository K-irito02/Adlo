import { defineConfig, mergeConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const testResolve = {
  alias: {
    "@ai-digital-life/kernel": path.resolve(__dirname, "src/kernel/index.ts"),
    "@app": path.resolve(__dirname, "src/app"),
    "@features": path.resolve(__dirname, "src/app/features"),
    "@stores": path.resolve(__dirname, "src/app/stores"),
    "@components": path.resolve(__dirname, "src/app/components"),
    "@icons": path.resolve(__dirname, "src/app/icons"),
    "@i18n": path.resolve(__dirname, "src/app/i18n"),
    "@utils": path.resolve(__dirname, "src/app/utils"),
    "@tauri-bridge": path.resolve(__dirname, "src/tauri-bridge"),
    "@regions": path.resolve(__dirname, "src/app/regions"),
    "@hooks": path.resolve(__dirname, "src/app/hooks"),
    "@shared": path.resolve(__dirname, "src/shared"),
    "@root": path.resolve(__dirname, "src"),
    "@": path.resolve(__dirname, "src"),
  },
};

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: testResolve,
  test: {
    pool: "forks",
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    // scripts/ 下是 node:test 风格的脚本单测（由根 test:scripts 经 node --test 运行），
    // vitest 误收会报 "No test suite found" 致 check:full 常红（2026-10-28）。
    exclude: ["**/node_modules/**", "**/dist/**", "scripts/**"],
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
});
