/**
 * 全局类重复定义检查。
 *
 * 背景：`.adl-btn` 曾在 `regions/context-menu.css` 与 `regions/titlebar.css`
 * 各定义一次，后加载者静默覆盖前者的圆角/背景，导致面板内按钮样式失控。
 * 本检查只扫描「顶层单类选择器」（行首 `.adl-xxx {`），发现同一类在多个
 * 文件重复定义即失败；`@media` 内的缩进规则与 scoped 选择器不参与。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STYLES_DIR = path.join(ROOT, "frontend/src/styles");
const TOP_LEVEL_CLASS = /^\.([a-z0-9-]+)\s*\{/;

/**
 * 既有重复定义基线：这些类在本次检查引入前就已存在于多个 region 文件，
 * 多为互补属性/历史拆分，逐项合并风险高于收益。新增重复定义一律拦截；
 * 触碰这些类时再按需收敛到共享样式表。
 */
const BASELINE = new Set([
  "adl-cm-editor",
  "adl-cm-fold-marker--closed",
  "adl-cm-fold-marker--open",
  "adl-cm-scroller--no-hscroll",
  "adl-multitree-entry",
  "adl-multitree-scroll",
  "adl-multitree-scrollbar",
  "adl-tool-hint",
  "adl-tool-primary",
  "adl-tool-primary--scrollable",
]);

/** 返回 [{ cls, files: string[] }]，仅包含出现在多个文件的顶层类。 */
export function findDuplicateGlobals(entries) {
  const byClass = new Map();
  for (const { file, content } of entries) {
    for (const line of content.split(/\r?\n/)) {
      const match = TOP_LEVEL_CLASS.exec(line);
      if (!match) {
        continue;
      }
      const cls = match[1];
      if (!byClass.has(cls)) {
        byClass.set(cls, new Set());
      }
      byClass.get(cls).add(file);
    }
  }
  return [...byClass.entries()]
    .filter(([, files]) => files.size > 1)
    .map(([cls, files]) => ({ cls, files: [...files].sort() }))
    .sort((a, b) => a.cls.localeCompare(b.cls));
}

function readCssEntries(dir) {
  const entries = [];
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      entries.push(...readCssEntries(full));
      continue;
    }
    if (dirent.isFile() && dirent.name.endsWith(".css")) {
      entries.push({
        file: path.relative(ROOT, full).replaceAll("\\", "/"),
        content: fs.readFileSync(full, "utf8"),
      });
    }
  }
  return entries;
}

function main() {
  const duplicates = findDuplicateGlobals(readCssEntries(STYLES_DIR));
  const fresh = duplicates.filter(({ cls }) => !BASELINE.has(cls));
  const baselined = duplicates.length - fresh.length;
  if (fresh.length === 0) {
    console.log(`[check-css-globals] OK (${baselined} known duplicates baselined)`);
    return;
  }
  console.error("[check-css-globals] new duplicate top-level class definitions:");
  for (const { cls, files } of fresh) {
    console.error(`  .${cls} -> ${files.join(", ")}`);
  }
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
