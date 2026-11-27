// Local fixture for real-WebView2 download-link verification (see SKILL.md §5).
// Run from adlo/: `node e2e/fixtures/download-link-server.mjs` (Ctrl+C to stop).
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 4789);
const payload = Buffer.alloc(64 * 1024, 0x41);
const html = `<!doctype html><meta charset="utf-8">
<title>Adlo download link fixture</title>
<a id="dl" target="_blank" download href="/package.bin">download</a>
`;

const server = createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (req.url === '/package.bin') {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="package.bin"',
      'content-length': String(payload.length),
    });
    res.end(payload);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, '127.0.0.1', () => {
  console.log(`download fixture: http://127.0.0.1:${port}/ (Ctrl+C to stop)`);
});
