import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { handlePreviewWorkspaceApi, isPreviewWorkspaceApiRequest } from "./dev/previewWorkspaceService";
import { handlePreviewTerminalApi, isPreviewTerminalApiRequest } from "./dev/previewTerminalService";

let visualizerPlugin = null;
if (process.env.BUILD_ANALYZE === "true") {
  const { visualizer } = await import("rollup-plugin-visualizer");
  visualizerPlugin = visualizer({ filename: "dist/stats.html", open: true, gzipSize: true });
}

export default defineConfig({
  plugins: [
    react(),
    visualizerPlugin,
    {
      name: "adl-preview-workspace-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (isPreviewTerminalApiRequest(req.url)) {
            void handlePreviewTerminalApi(req, res);
            return;
          }
          if (!isPreviewWorkspaceApiRequest(req.url)) {
            next();
            return;
          }
          void handlePreviewWorkspaceApi(req, res);
        });
      }
    }
  ].filter(Boolean),
  resolve: {
    alias: {
      "@ai-digital-life/kernel": path.resolve(__dirname, "src/kernel/index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: Number.parseInt(process.env.ADL_PORT ?? process.env.PORT ?? "5173", 10),
    strictPort: false,
    headers: {
      // 允许 iframe 嵌入（使用现代 Content-Security-Policy 替代非标准 X-Frame-Options: ALLOWALL）
      'Content-Security-Policy': 'frame-ancestors *'
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-dom/client"],
          "vendor-codemirror": [
            "@codemirror/state", "@codemirror/view", "@codemirror/language",
            "@codemirror/commands", "@codemirror/autocomplete", "@codemirror/search",
            "@codemirror/lint", "@codemirror/lang-javascript", "@codemirror/lang-json",
            "@codemirror/lang-markdown", "@codemirror/lang-python", "@codemirror/lang-rust",
            "@codemirror/lang-sql", "@codemirror/lang-css", "@codemirror/lang-html",
            "@codemirror/lang-xml", "@codemirror/lang-yaml", "@codemirror/merge",
          ],
          "vendor-xterm": ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-web-links"],
          "vendor-zustand": ["zustand"],
          "vendor-markdown": ["markdown-it", "react-markdown", "remark-gfm"],
          "vendor-pdf": ["pdfjs-dist"],
        },
      },
    },
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
      "@codemirror/lang-javascript",
      "@codemirror/lang-json",
      "@codemirror/lang-markdown",
      "@codemirror/lang-python",
      "@codemirror/lang-rust",
      "@codemirror/lang-sql",
      "@codemirror/lang-css",
      "@codemirror/lang-html",
      "@codemirror/lang-xml",
      "@codemirror/lang-yaml",
      "@codemirror/merge",
    ],
  },
  clearScreen: false,
});
