import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { handlePreviewWorkspaceApi, isPreviewWorkspaceApiRequest } from "./dev/previewWorkspaceService";
import { setupPreviewTerminalWs } from "./dev/previewTerminalService";
import { pageMetaGateAllows } from "./dev/previewCrawlerGate";
import { fetchPageMetaOnce } from "./dev/previewFetchPageMeta";

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
          // 仅精确匹配遗留 GET 端点 /__adl_preview_api__/browser/page-meta；
          // /browser/page-meta/get|report|refresh|warmup 等 POST 路由交给
          // handlePreviewWorkspaceApi 处理（pageMetaService.ts）。
          if (req.url && new URL(req.url, 'http://localhost').pathname === '/__adl_preview_api__/browser/page-meta') {
            const searchParams = new URL(req.url, 'http://localhost').searchParams;
            const targetUrl = searchParams.get('url');
            if (!targetUrl) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'missing url parameter' }));
              return;
            }
            // 合规爬虫门控：robots.txt Disallow 硬跳过（私网豁免 / fail-open 见辅助函数）。
            if (!(await pageMetaGateAllows(targetUrl))) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ title: '', favicon: '', faviconDataUri: '', url: targetUrl }));
              return;
            }
            try {
              // 共享抓取：HTML 解析 + 图标回退链 + dataUri 下载（内部含 favicon robots-only 门控）。
              const meta = await fetchPageMetaOnce(targetUrl);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify(meta));
            } catch {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ title: '', favicon: '', faviconDataUri: '', url: targetUrl }));
            }
            return;
          }
          if (req.url?.includes('/__adl_preview_api__/browser/scan-ports')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            const COMMON_PORTS = [3000, 5173, 8000, 8080, 9000, 4000, 5000, 4200, 3001, 5174];
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
        manualChunks(id: string) {
          if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react';
          if (id.includes('@codemirror')) return 'vendor-codemirror';
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
