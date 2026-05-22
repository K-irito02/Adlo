import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { handlePreviewWorkspaceApi, isPreviewWorkspaceApiRequest } from "./dev/previewWorkspaceService";
import { handlePreviewTerminalApi, isPreviewTerminalApiRequest } from "./dev/previewTerminalService";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "adl-preview-workspace-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          console.log("Request:", req.method, req.url);
          if (isPreviewTerminalApiRequest(req.url)) {
            console.log("Handling terminal API request");
            void handlePreviewTerminalApi(req, res);
            return;
          }
          if (!isPreviewWorkspaceApiRequest(req.url)) {
            next();
            return;
          }
          console.log("Handling workspace API request");
          void handlePreviewWorkspaceApi(req, res);
        });
      }
    }
  ],
  resolve: {
    alias: {
      "@ai-digital-life/kernel": path.resolve(__dirname, "src/kernel/index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: Number.parseInt(process.env.ADL_PORT ?? process.env.PORT ?? "5173", 10),
    strictPort: false,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
  },
  optimizeDeps: {
    include: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@codemirror/commands",
      "@codemirror/autocomplete",
      "@codemirror/search",
      "@codemirror/lint",
    ],
  },
  clearScreen: false,
});
