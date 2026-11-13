/**
 * 文档索引链接守卫：`docs/**\/README.md` 里的相对链接必须解析到真实存在的文件或目录。
 *
 * 动机：check-kb-counts 只覆盖 `docs/knowledge-base`；`docs/specs`、`docs/adr`、
 * `docs/design-system` 等索引的链接写错文件名不会有任何门禁发现，`check:repo`
 * 会给"全绿"的假信心（2026-11-13 retro）。
 *
 * 只校验相对链接；http(s)、mailto、锚点与绝对路径跳过。链接的 `#fragment` / `?query`
 * 在解析前剥掉；路径做一次 URL 解码（`%20` 等）。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const docsRoot = path.join(repoRoot, "docs");

const LINK = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const SKIP = /^(?:https?:|mailto:|tel:|#|\/)/i;

function collectReadmes(dir) {
  const out = [];
  if (!existsSync(dir)) {
    return out;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectReadmes(full));
    } else if (entry.name === "README.md") {
      out.push(full);
    }
  }
  return out;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const problems = [];
const readmes = collectReadmes(docsRoot);
for (const file of readmes) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(LINK)) {
      const target = match[1];
      if (SKIP.test(target)) {
        continue;
      }
      const clean = safeDecode(target.split("#")[0].split("?")[0]);
      if (!clean) {
        continue;
      }
      const resolved = path.resolve(path.dirname(file), clean);
      if (!existsSync(resolved)) {
        problems.push(`${path.relative(repoRoot, file)}:${index + 1}  ->  ${target}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error("[docs-links] 文档索引存在失效链接：");
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}
console.log(`[docs-links] OK (${readmes.length} READMEs, links verified)`);
