import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { handlePreviewWorkspaceApi, isPreviewWorkspaceApiRequest } from "./dev/previewWorkspaceService";
import { setupPreviewTerminalWs } from "./dev/previewTerminalService";
// dev 端口基准与启动器（scripts/dev-port.mjs）同源，避免两份区间各自漂移。
import { DEV_PORT_BASE } from "../scripts/dev-port.mjs";


let visualizerPlugin = null;
if (process.env.BUILD_ANALYZE === "true") {
  const { visualizer } = await import("rollup-plugin-visualizer");
  visualizerPlugin = visualizer({ filename: "dist/stats.html", open: true, gzipSize: true });
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    visualizerPlugin,
    {
      name: "adl-preview-workspace-api",
      configureServer(server) {
        if (server.httpServer) {
          setupPreviewTerminalWs(server.httpServer);
        }
        // 开发期实例身份探针：启动脚本（scripts/run-project-surface.mjs）用它确认
        // "这个端口上跑的确实是本工作树的 vite"。端口被另一个工作树的 dev server 占用时，
        // 裸 HTTP 探活会被对方满足，Tauri 便静默渲染别人的前端（2026-10-25 实测）。
        server.middlewares.use((req, res, next) => {
          if (req.url === '/__adl_dev_instance__') {
            const token = process.env.ADL_DEV_TOKEN ?? '';
            res.setHeader('Cache-Control', 'no-store');
            // 未注入令牌（如直接 `vite` / `frontend:dev`）：视作不存在，避免空串 200 被误判。
            if (req.method !== 'GET' || token === '') {
              res.statusCode = 404;
              res.end();
              return;
            }
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(token);
            return;
          }
          next();
        });
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.includes('/__adl_preview_api__/browser/check-embed')) {
            const searchParams = new URL(req.url, 'http://localhost').searchParams;
            const targetUrl = searchParams.get('url');
            if (!targetUrl) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'missing url parameter' }));
              return;
            }
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 3000);
              const response = await fetch(targetUrl, {
                method: 'HEAD',
                signal: controller.signal,
                redirect: 'follow',
              });
              clearTimeout(timeout);
              const xfo = response.headers.get('x-frame-options');
              const csp = response.headers.get('content-security-policy');
              const embedOrigin = searchParams.get('embedOrigin') || '';
              let blocked = false;
              if (xfo) {
                const val = xfo.toLowerCase();
                if (val === 'deny') {
                  blocked = true;
                } else if (val === 'sameorigin') {
                  try {
                    blocked = !embedOrigin || new URL(targetUrl).origin !== embedOrigin;
                  } catch {
                    blocked = true;
                  }
                }
              }
              if (!blocked && csp) {
                const match = csp.match(/frame-ancestors\s+([^;]+)/i);
                if (match) {
                  const val = match[1].trim();
                  if (val === "'none'") {
                    blocked = true;
                  } else if (val === "'self'") {
                    try {
                      blocked = !embedOrigin || new URL(targetUrl).origin !== embedOrigin;
                    } catch {
                      blocked = true;
                    }
                  }
                }
              }
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, blocked, url: targetUrl }));
            } catch {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, blocked: true, url: targetUrl, error: 'fetch_failed' }));
            }
            return;
          }
          // /browser/page-meta/get|report|refresh|warmup 等 POST 路由交给
          // handlePreviewWorkspaceApi 处理（pageMetaService.ts）。
          if (req.url?.includes('/__adl_preview_api__/browser/scan-ports')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            // 5173 起 10 个端口覆盖 slot-1..slot-9 的稳定 dev 端口（主工作树 5173、slot-N → 5173+N）。
            const COMMON_PORTS = [
              3000, 8000, 8080, 9000, 4000, 5000, 4200, 3001,
              ...Array.from({ length: 10 }, (_, i) => DEV_PORT_BASE + i),
            ];
            const discovered: Array<{ host: string; port: number }> = [];
            try {
              const net = await import('node:net');
              await Promise.all(
                COMMON_PORTS.map(
                  (port) =>
                    new Promise<void>((resolve) => {
                      try {
                        const socket = new net.default.Socket();
                        socket.setTimeout(500);
                        socket.once('connect', () => {
                          discovered.push({ host: 'localhost', port });
                          socket.destroy();
                          resolve();
                        });
                        socket.once('error', () => { socket.destroy(); resolve(); });
                        socket.once('timeout', () => { socket.destroy(); resolve(); });
                        socket.connect(port, '127.0.0.1');
                      } catch { resolve(); }
                    })
                )
              );
            } catch { /* net module unavailable */ }
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, data: discovered }));
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
    dedupe: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
    ],
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
  },
  server: {
    // host 与 port 同源：都从启动器注入的环境变量读取（裸 `vite` 时回退本地回环）。
    host: process.env.ADL_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.ADL_PORT ?? process.env.PORT ?? "5173", 10),
    // 端口被占用时必须失败，不能静默顺延：`pnpm dev:tauri` 会把 Tauri 的 devUrl 固定为
    // 启动脚本选定的端口，顺延后窗口会去加载**另一个工作树**同端口上正在跑的 dev server，
    // 表现为"改了代码却完全没变化"（2026-10-25 实测：slot-1 vite 落到 5174，窗口加载主工作树的 5173）。
    strictPort: true,
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
    chunkSizeWarningLimit: 950,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        // 透明桥接条（divider strip）独立入口：极简控制面，自带 @tauri-apps/api 调用。
        'divider-strip': path.resolve(__dirname, 'divider-strip.html'),
      },
      output: {
        manualChunks(id: string) {
          if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react';
          if (id.includes('@codemirror')) {
            if (id.includes('/merge') || id.includes('/autocomplete')) return 'vendor-codemirror-addons';
            return 'vendor-codemirror';
          }
          if (id.includes('@xterm')) return 'vendor-xterm';
          if (id.includes('zustand')) return 'vendor-zustand';
          if (id.includes('markdown-it') || id.includes('react-markdown') || id.includes('remark-gfm')) return 'vendor-markdown';
          if (id.includes('pdfjs-dist')) return 'vendor-pdf';
          if (id.includes('highlight.js') || id.includes('highlight.js/')) return 'vendor-highlight';
          if (id.includes('mammoth')) return 'vendor-mammoth';
          if (id.includes('motion') || id.includes('framer-motion')) return 'vendor-motion';
          return undefined;
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
