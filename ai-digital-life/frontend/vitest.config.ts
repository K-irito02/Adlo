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
    exclude: ["**/node_modules/**", "**/dist/**"],
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
