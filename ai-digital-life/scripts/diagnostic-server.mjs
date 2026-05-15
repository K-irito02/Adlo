import { createServer } from "node:http";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = join(__dirname, "..", "diagnostic-logs");
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

let sampleCount = 0;

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/diag") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      sampleCount++;
      const timestamp = Date.now();
      const filename = join(logDir, `sample-${timestamp}.json`);
      try {
        writeFileSync(filename, body, "utf-8");
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(`saved: ${filename}`);
        console.log(`[DIAG-SRV] #${sampleCount} saved: ${filename}`);
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
  } else if (req.url === "/diag/flush") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`total samples: ${sampleCount}`);
  } else {
    res.writeHead(404);
    res.end("not found");
  }
});

const PORT = 19783;
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[DIAG-SRV] listening on http://127.0.0.1:${PORT}`);
});