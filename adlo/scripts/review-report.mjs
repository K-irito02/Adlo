#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REQUIRED_SECTIONS = ["范围", "上轮问题关闭情况", "新增发现", "结论"];

/** 仓库根（脚本位于 `adlo/scripts/`）：报告路径统一相对它解析，避免随调用方 cwd 落到 `adlo/.review-diffs`。 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 相对路径按仓库根解析，绝对路径原样返回。与 `check-review-gate` 的 `.review-diffs` 口径一致。 */
export function resolveReportPath(input) {
  return resolve(REPO_ROOT, input);
}

export function createReport(path, { scope, phase, rev, force = false }) {
  if (!scope) throw new Error("--scope is required");
  if (!["r1", "r2"].includes(phase)) throw new Error("--phase must be r1 or r2");
  if (!Number.isInteger(rev) || rev <= 0) throw new Error("--rev must be a positive integer");
  const target = resolveReportPath(path);
  if (existsSync(target) && !force) {
    throw new Error(`report already exists: ${target}`);
  }
  const text = `## 范围\n\n- scope：${scope}\n- phase：${phase}\n- rev：${rev}\n\n## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）\n\n- 无上一轮 finding。\n\n## 新增发现\n\n- 无。\n\n## 结论\n\n- 需修复项：0\n- critical/high/medium/low：各 0。\n`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
  return text;
}

export function validateReport(input) {
  const text = input.replace(/\r\n/g, "\n");
  const errors = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!text.split("\n").some((line) => line.startsWith(`## ${section}`))) {
      errors.push(`missing section: ## ${section}`);
    }
  }
  const exactMatches = [...text.matchAll(/^- 需修复项：(0|[1-9]\d*)$/gm)];
  const conclusionLines = text.split("\n").filter((line) => line.includes("需修复项"));
  const renderLines = () => conclusionLines.map((line) => JSON.stringify(line.trim())).join(", ");
  if (exactMatches.length === 0) {
    errors.push(
      conclusionLines.length > 0
        ? `missing exact conclusion line "- 需修复项：N" (found ${conclusionLines.length} line(s) mentioning 需修复项: ${renderLines()})`
        : 'missing exact conclusion line: "- 需修复项：N"',
    );
  } else if (exactMatches.length > 1) {
    errors.push("multiple conclusion lines; keep exactly one");
  } else if (conclusionLines.length !== 1) {
    errors.push(
      `additional 需修复项 lines are not allowed; keep exactly one conclusion line (found: ${renderLines()})`,
    );
  }
  return {
    ok: errors.length === 0,
    errors,
    count: exactMatches.length === 1 ? Number(exactMatches[0][1]) : null,
  };
}

export function validateReportFile(path) {
  const target = resolveReportPath(path);
  if (!existsSync(target)) {
    return { ok: false, errors: [`report file not found: ${target}`], count: null };
  }
  try {
    return validateReport(readFileSync(target, "utf8"));
  } catch (error) {
    return { ok: false, errors: [`failed to read report: ${error.message}`], count: null };
  }
}

function parseArgs(argv) {
  const command = argv[0];
  if (command === "create") {
    const path = argv[1];
    const option = (name) => {
      const index = argv.indexOf(name);
      return index >= 0 ? argv[index + 1] : undefined;
    };
    return {
      command,
      path,
      scope: option("--scope"),
      phase: option("--phase"),
      rev: Number(option("--rev")),
      force: argv.includes("--force"),
    };
  }
  if (command === "check") {
    return { command, path: argv[1] };
  }
  throw new Error("usage: review-report.mjs <create|check> <path> [...]");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.path) throw new Error("report path is required");
  if (options.command === "create") {
    const text = createReport(options.path, options);
    console.log(`[review-report] created ${resolveReportPath(options.path)}`);
    const result = validateReport(text);
    if (!result.ok) {
      console.error(result.errors.join("\n"));
      process.exit(1);
    }
    return;
  }
  const result = validateReportFile(options.path);
  if (!result.ok) {
    console.error(`[review-report] invalid ${resolveReportPath(options.path)}`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`[review-report] OK ${resolveReportPath(options.path)} (需修复项：${result.count})`);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`[review-report] ${error.message}`);
    process.exit(1);
  }
}
