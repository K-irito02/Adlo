/**
 * Throwaway-prototype static server.
 *
 * Prototypes live under `adlo/frontend/prototype/<name>/index.html` and link the
 * real app stylesheet (`../../src/styles/index.css`), so the server root MUST be
 * `adlo/frontend/` — do not serve the prototype directory itself.
 *
 * Fixed port 5200 with a clear failure (never silently drifts to another port,
 * which would make "my edit did nothing" debugging look like a code problem).
 *
 * Usage: `pnpm run prototype:serve` (from `adlo/`), Ctrl+C to stop.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PORT = 5200;
const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "frontend");
const PROTOTYPE_ROOT = path.join(FRONTEND_ROOT, "prototype");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function listPrototypes() {
  if (!fs.existsSync(PROTOTYPE_ROOT)) {
    return [];
  }
  return fs
    .readdirSync(PROTOTYPE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(PROTOTYPE_ROOT, name, "index.html")));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/" || pathname === "/prototype" || pathname === "/prototype/") {
    const names = listPrototypes();
    const body = names.length
      ? `<ul>${names.map((n) => `<li><a href="/prototype/${n}/index.html">${n}</a></li>`).join("")}</ul>`
      : "<p>No prototypes found under <code>adlo/frontend/prototype/</code>.</p>";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>prototypes</title>${body}`);
    return;
  }

  const absolute = path.resolve(FRONTEND_ROOT, `.${pathname}`);
  if (!absolute.startsWith(FRONTEND_ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(absolute, (error, data) => {
    if (error) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(absolute)] ?? "application/octet-stream",
    });
    res.end(data);
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `[prototype] port ${PORT} is busy — stop the other server first (no silent port drift).`,
    );
    process.exit(1);
  }
  console.error(`[prototype] server error: ${String(error)}`);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[prototype] serving adlo/frontend on http://127.0.0.1:${PORT}/`);
  for (const name of listPrototypes()) {
    console.log(`[prototype]   http://127.0.0.1:${PORT}/prototype/${name}/index.html`);
  }
  console.log("[prototype] Ctrl+C to stop");
});
