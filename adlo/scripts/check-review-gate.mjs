#!/usr/bin/env node
/**
 * P4 审查顺序门控：R2 派发前置检查。
 *
 * 技能规定「R1 零问题后才能启动 R2」，但纯文字门控在长会话里容易被跳过
 * （2026-11-15 实测 4 次误派发）。本脚本从 `.review-diffs` 读取每个 R1 scope
 * 的**最新** rev 报告，要求全部明确写「需修复项：0」；任一缺失/非零即退出 1。
 *
 * 用法：`node adlo/scripts/check-review-gate.mjs --phase r2 [--dir .review-diffs]`
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPORT_RE = /^(.+)-r1-rev(\d+)-report\.md$/;
const ZERO_RE = /需修复项\s*[:：]\s*0(?:\D|$)/;

const parseArgs = (argv) => {
  const options = { phase: "r2", dir: path.join(ROOT, ".review-diffs") };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--phase") {
      options.phase = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--dir") {
      options.dir = path.resolve(argv[i + 1] ?? "");
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
};

/** 每个 scope 取 rev 最大的一份（rev 数字按数值比较，避免 rev10 < rev9）。 */
export function latestR1Reports(entries) {
  const latest = new Map();
  for (const entry of entries) {
    const match = REPORT_RE.exec(entry.name);
    if (!match) {
      continue;
    }
    const [, scope, revText] = match;
    const rev = Number(revText);
    const prev = latest.get(scope);
    if (!prev || rev > prev.rev) {
      latest.set(scope, { scope, rev, name: entry.name, text: entry.text });
    }
  }
  return [...latest.values()].sort((a, b) => a.scope.localeCompare(b.scope));
}

/**
 * @param {{name: string, text: string}[]} entries
 * @returns {{ok: boolean, scopes: {scope: string, rev: number}[], failing: {scope: string, rev: number}[]}}
 */
export function evaluateR2Gate(entries) {
  const reports = latestR1Reports(entries);
  if (reports.length === 0) {
    return { ok: false, scopes: [], failing: [] };
  }
  const zeroReports = reports.filter((report) => {
    const matches = [...report.text.matchAll(new RegExp(ZERO_RE.source, "g"))];
    const last = matches.at(-1)?.[0] ?? "";
    return ZERO_RE.test(last);
  });
  const zeroScopes = new Set(zeroReports.map((report) => report.scope));
  return {
    ok: zeroReports.length === reports.length,
    scopes: reports.map(({ scope, rev }) => ({ scope, rev })),
    failing: reports
      .filter((report) => !zeroScopes.has(report.scope))
      .map(({ scope, rev }) => ({ scope, rev })),
  };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[review-gate] ${String(error)}`);
    console.error("usage: node scripts/check-review-gate.mjs --phase r2 [--dir .review-diffs]");
    process.exit(1);
  }
  if (options.phase !== "r2") {
    console.error(`[review-gate] unsupported phase: ${options.phase} (only r2)`);
    process.exit(1);
  }
  if (!existsSync(options.dir)) {
    console.error(`[review-gate] review dir not found: ${options.dir}`);
    process.exit(1);
  }
  const entries = readdirSync(options.dir)
    .filter((name) => REPORT_RE.test(name))
    .map((name) => ({ name, text: readFileSync(path.join(options.dir, name), "utf8") }));
  const result = evaluateR2Gate(entries);
  if (!result.ok) {
    console.error("[review-gate] R1 is not at zero; R2 must not start.");
    if (result.scopes.length === 0) {
      console.error("  no *-r1-rev*-report.md found in the review dir");
    }
    for (const { scope, rev } of result.failing) {
      console.error(`  ${scope} rev${rev}: latest R1 report is not at "需修复项：0"`);
    }
    process.exit(1);
  }
  console.log(
    `[review-gate] OK (R1 zero: ${result.scopes.map(({ scope, rev }) => `${scope}@rev${rev}`).join(", ")})`,
  );
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  main();
}
