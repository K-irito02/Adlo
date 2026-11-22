#!/usr/bin/env node
/**
 * 把 `.review-diffs` 中每个 scope 的最终 R1/R2 报告归档到
 * `docs/root-cause-to-close/<YYYY-MM>/reviews/<progress-stem>/`。
 *
 * 只复制报告，不复制 diff；同名覆盖，只保留最新 rev。P6 删除快照前运行，
 * 再由 `check-review-gate.mjs --phase p6` 校验归档完整。
 *
 * 用法：`node adlo/scripts/archive-review-reports.mjs [--dir .review-diffs] [--progress <file>]`
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { findLatestProgressFile, latestR1Reports, latestR2Reports } from "./check-review-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseArgs(argv) {
  const options = { dir: path.join(ROOT, ".review-diffs"), progress: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dir") {
      options.dir = path.resolve(argv[i + 1] ?? "");
      i += 1;
    } else if (arg === "--progress") {
      options.progress = path.resolve(argv[i + 1] ?? "");
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[archive-reviews] ${String(error)}`);
    console.error(
      "usage: node scripts/archive-review-reports.mjs [--dir .review-diffs] [--progress <file>]",
    );
    process.exit(1);
  }

  const progress = options.progress ?? findLatestProgressFile(ROOT);
  if (!progress || !existsSync(progress)) {
    console.error("[archive-reviews] progress file not found; pass --progress <file>.");
    process.exit(1);
  }
  if (!existsSync(options.dir)) {
    console.error(`[archive-reviews] review dir not found: ${options.dir}`);
    process.exit(1);
  }

  const entries = readdirSync(options.dir)
    .filter((name) => /-r[12]-rev\d+-report\.md$/.test(name))
    .map((name) => ({ name, text: readFileSync(path.join(options.dir, name), "utf8") }));
  const reports = [...latestR1Reports(entries), ...latestR2Reports(entries)];
  if (reports.length === 0) {
    console.error(`[archive-reviews] no final R1/R2 reports found in ${options.dir}`);
    process.exit(1);
  }

  const archiveDir = path.join(path.dirname(progress), "reviews", path.basename(progress, ".md"));
  mkdirSync(archiveDir, { recursive: true });
  for (const report of reports) {
    copyFileSync(path.join(options.dir, report.name), path.join(archiveDir, report.name));
  }
  console.log(
    `[archive-reviews] archived ${reports.length} reports to ${path.relative(ROOT, archiveDir)}`,
  );
  for (const report of reports) {
    console.log(`  ${report.name}`);
  }
}

main();
