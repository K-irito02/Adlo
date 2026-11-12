/**
 * knowledge-base 索引自检（"计数没人敢信" — 2026-11-12 retro 收录）：
 *
 * A. 计数行校验：README 中的计数必须与磁盘真相一致。支持两种书写：
 *    1. 目录表行：`| [label](./dir/) | … | N |`（docs/knowledge-base/README.md 的目录总表）
 *    2. 索引要点：`- `dir/` — …（N）`（全角括号，docs/knowledge-base/README.md 的 Browser 节）
 *    计数口径：该目录下 `*.md` 文件数（**不含** README.md），递归。
 *
 * B. 链接存在性：README 中一切相对链接 `](./…)` / `](../…)` 必须解析到存在的文件或目录
 *    （跳过 http(s)、mailto、纯锚点链接）。
 *
 * 作用范围：docs/knowledge-base/**\/README.md
 * 退出码：任一校验失败即非零。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const KB_DIR = path.join(ROOT, "docs", "knowledge-base");

/** 递归收集 KB 下所有 README.md（含子主题目录） */
function collectReadmes(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectReadmes(full));
    } else if (entry.name === "README.md") {
      out.push(full);
    }
  }
  return out;
}

/** 统计目录下 *.md 文件数（不含 README.md），递归 */
function countMd(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countMd(full);
    } else if (/\.md$/i.test(entry.name) && entry.name !== "README.md") {
      count += 1;
    }
  }
  return count;
}

const findings = [];

const readmes = collectReadmes(KB_DIR);
for (const readme of readmes) {
  const lines = fs.readFileSync(readme, "utf8").split(/\r?\n/);
  lines.forEach((line, idx) => {
    const where = `${path.relative(ROOT, readme).replace(/\\/g, "/")}:${idx + 1}`;

    // A1. 目录表计数行：`| [x](./dir/) | ... | N |`
    const tableRow = line.match(/^\|.*\(\.\/([\w-]+(?:\/[\w-]+)*)\/?\)\s*\|.*\|\s*(\d+)\s*\|\s*$/);
    if (tableRow) {
      const dir = path.join(path.dirname(readme), tableRow[1]);
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        const actual = countMd(dir);
        if (actual !== Number(tableRow[2])) {
          findings.push(`${where} 计数 ${tableRow[2]} ≠ 实际 ${actual}（${tableRow[1]}/）`);
        }
      }
    }

    // A2. 索引要点：`- \`dir/\` — …（N）`
    const bullet = line.match(/^\s*-\s+`([\w-]+(?:\/[\w-]+)*\/)`[^\n]*（(\d+)）\s*$/);
    if (bullet) {
      const dir = path.join(path.dirname(readme), bullet[1]);
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        const actual = countMd(dir);
        if (actual !== Number(bullet[2])) {
          findings.push(`${where} 计数 ${bullet[2]} ≠ 实际 ${actual}（${bullet[1]}）`);
        }
      }
    }

    // B. 相对链接存在性
    for (const m of line.matchAll(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g)) {
      const target = path.resolve(path.dirname(readme), m[1]);
      if (!fs.existsSync(target)) {
        findings.push(`${where} 链接目标不存在：${m[1]}`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error("[check:kb-counts] FAILED:");
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[check:kb-counts] OK (${readmes.length} READMEs, counts & links verified)`);
