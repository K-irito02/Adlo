#!/usr/bin/env node
/**
 * P4 审查顺序门控：R2 派发前置检查。
 *
 * 技能规定「R1 零问题后才能启动 R2」，但纯文字门控在长会话里容易被跳过
 * （2026-11-15 实测 4 次误派发）。本脚本从 `.review-diffs` 读取每个 R1 scope
 * 的**最新** rev 报告，要求全部明确写「需修复项：0」；任一缺失/非零即退出 1。
 *
 * 用法：`node adlo/scripts/check-review-gate.mjs --phase r1|r2|exit|p6 [--dir .review-diffs] [--progress <file>]`
 * - `r1`：检查进度文件的 P3→P4 用户批准标记（防止未经用户验收就开审）。
 * - `r2`：检查每个 R1 scope 的最新报告是否「需修复项：0」。
 * - `exit`：P4 退出前检查——R1 与 R2 各自最新一轮都必须「需修复项：0」，
 *   且 R2 至少有一份报告（防止「R2 未派发」或「R2 有未闭合项」直接进 P5）。
 * - `p6`：清理前检查——最新 R1/R2 报告必须已归档到
 *   `docs/root-cause-to-close/<YYYY-MM>/reviews/<progress-stem>/`；
 *   `.review-diffs` 仍在时还要求归档文件名与最新快照逐一同名。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPORT_RE = /^(.+)-r1-rev(\d+)-report\.md$/;
const R2_REPORT_RE = /^(.+)-r2-rev(\d+)-report\.md$/;
const ZERO_RE = /需修复项\s*[:：]\s*0(?:\D|$)/;

/**
 * P3→P4 用户批准标记（技能门控）：
 * 进度文件必须有一行 `- P3→P4 用户批准：是（日期）`；用户明确授权直接收尾时可写 `不需要`。
 */
const APPROVAL_RE = /P3\s*(?:→|->|-)\s*P4\s*用户批准\s*[:：]\s*(是|不需要)/iu;

export function hasP3P4Approval(progressText) {
  return APPROVAL_RE.test(progressText);
}

/** 最近修改的进度文件（docs/root-cause-to-close/<YYYY-MM>/progress-*.md）。 */
export function findLatestProgressFile(root) {
  const base = path.join(root, "docs", "root-cause-to-close");
  if (!existsSync(base)) {
    return null;
  }
  const candidates = [];
  for (const month of readdirSync(base, { withFileTypes: true })) {
    if (!month.isDirectory()) {
      continue;
    }
    const dir = path.join(base, month.name);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && /^progress-.*\.md$/.test(entry.name)) {
        const file = path.join(dir, entry.name);
        candidates.push({ file, mtime: fsStatMtime(file) });
      }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.file ?? null;
}

function fsStatMtime(file) {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

const parseArgs = (argv) => {
  const options = {
    phase: "r2",
    dir: path.join(ROOT, ".review-diffs"),
    progress: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--phase") {
      options.phase = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--dir") {
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
};

/** 每个 scope 取 rev 最大的一份（rev 数字按数值比较，避免 rev10 < rev9）。 */
function latestReports(entries, reportRe) {
  const latest = new Map();
  for (const entry of entries) {
    const match = reportRe.exec(entry.name);
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

export function latestR1Reports(entries) {
  return latestReports(entries, REPORT_RE);
}

export function latestR2Reports(entries) {
  return latestReports(entries, R2_REPORT_RE);
}

/** 最新一轮报告是否每个 scope 都写「需修复项：0」。 */
function scopeGate(reports) {
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

/**
 * @param {{name: string, text: string}[]} entries
 * @returns {{ok: boolean, scopes: {scope: string, rev: number}[], failing: {scope: string, rev: number}[]}}
 */
export function evaluateR2Gate(entries) {
  return scopeGate(latestR1Reports(entries));
}

/**
 * P4 退出：R1 与 R2 都必须是「最新一轮零问题」，且各自至少有一份报告。
 * @param {{name: string, text: string}[]} entries
 */
export function evaluateExitGate(entries) {
  const r1 = evaluateR2Gate(entries);
  const r2 = scopeGate(latestR2Reports(entries));
  return {
    ok: r1.ok && r2.ok,
    r1,
    r2,
  };
}

/**
 * P6 归档门：最新 R1/R2 报告必须存在于 archive，且（快照仍在时）与快照中的
 * 最新报告逐一同名。快照已删时退化为「archive 自身至少各有一份 R1/R2」。
 *
 * @param {{name: string, text: string}[]} snapshotEntries
 * @param {{name: string, text: string}[]} archiveEntries
 */
export function evaluateArchiveGate(snapshotEntries, archiveEntries) {
  const hasSnapshots = snapshotEntries.some(
    (entry) => REPORT_RE.test(entry.name) || R2_REPORT_RE.test(entry.name),
  );
  const r1 = latestR1Reports(hasSnapshots ? snapshotEntries : archiveEntries);
  const r2 = latestR2Reports(hasSnapshots ? snapshotEntries : archiveEntries);
  const archiveNames = new Set(archiveEntries.map((entry) => entry.name));
  const missing = [...r1, ...r2]
    .map((report) => report.name)
    .filter((name) => !archiveNames.has(name));
  return {
    ok: r1.length > 0 && r2.length > 0 && missing.length === 0,
    r1: r1.map(({ scope, rev, name }) => ({ scope, rev, name })),
    r2: r2.map(({ scope, rev, name }) => ({ scope, rev, name })),
    missing,
  };
}

/** 读取目录里的 R1/R2 报告；目录不存在时返回空数组（P6 快照已删是合法状态）。 */
function readReportEntries(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => REPORT_RE.test(name) || R2_REPORT_RE.test(name))
    .map((name) => ({ name, text: readFileSync(path.join(dir, name), "utf8") }));
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[review-gate] ${String(error)}`);
    console.error(
      "usage: node scripts/check-review-gate.mjs --phase r1|r2|exit [--dir .review-diffs] [--progress <file>]",
    );
    process.exit(1);
  }
  if (
    options.phase !== "r1" &&
    options.phase !== "r2" &&
    options.phase !== "exit" &&
    options.phase !== "p6"
  ) {
    console.error(
      `[review-gate] unsupported phase: ${options.phase} (expected r1, r2, exit or p6)`,
    );
    process.exit(1);
  }
  if (options.phase === "r1") {
    const progress = options.progress ?? findLatestProgressFile(ROOT);
    if (!progress || !existsSync(progress)) {
      console.error("[review-gate] progress file not found; pass --progress <file>.");
      process.exit(1);
    }
    const text = readFileSync(progress, "utf8");
    if (!hasP3P4Approval(text)) {
      console.error(
        [
          "[review-gate] P3→P4 user approval missing; R1 must not start.",
          `  progress: ${progress}`,
          '  add: "- P3→P4 用户批准：是（YYYY-MM-DD）" after the user approves,',
          '  or "- P3→P4 用户批准：不需要（用户已明确授权直接收尾）".',
        ].join("\n"),
      );
      process.exit(1);
    }
    console.log(`[review-gate] OK (P3→P4 approved in ${path.relative(ROOT, progress)})`);
    return;
  }
  if (options.phase === "p6") {
    const progress = options.progress ?? findLatestProgressFile(ROOT);
    if (!progress || !existsSync(progress)) {
      console.error("[review-gate] progress file not found; pass --progress <file>.");
      process.exit(1);
    }
    const archiveDir = path.join(path.dirname(progress), "reviews", path.basename(progress, ".md"));
    const result = evaluateArchiveGate(
      readReportEntries(options.dir),
      readReportEntries(archiveDir),
    );
    if (!result.ok) {
      console.error("[review-gate] P6 archive blocked: latest R1/R2 reports must be archived.");
      console.error(`  progress: ${path.relative(ROOT, progress)}`);
      console.error(`  archive:  ${path.relative(ROOT, archiveDir)}`);
      if (result.r1.length === 0) {
        console.error("  no R1 report found (snapshot or archive)");
      }
      if (result.r2.length === 0) {
        console.error("  no R2 report found (snapshot or archive)");
      }
      for (const name of result.missing) {
        console.error(`  missing from archive: ${name}`);
      }
      console.error(
        "  hint: node adlo/scripts/archive-review-reports.mjs --progress <progress.md>",
      );
      process.exit(1);
    }
    console.log(
      `[review-gate] OK (P6 archive: ${result.r1.length} R1 + ${result.r2.length} R2 reports in ${path.relative(ROOT, archiveDir)})`,
    );
    return;
  }
  if (!existsSync(options.dir)) {
    console.error(`[review-gate] review dir not found: ${options.dir}`);
    process.exit(1);
  }
  const entries = readReportEntries(options.dir);
  if (options.phase === "exit") {
    const result = evaluateExitGate(entries);
    if (!result.ok) {
      console.error("[review-gate] P4 exit blocked: R1 and R2 must both be at zero.");
      if (result.r1.scopes.length === 0) {
        console.error("  no *-r1-rev*-report.md found in the review dir");
      }
      for (const { scope, rev } of result.r1.failing) {
        console.error(`  ${scope} rev${rev}: latest R1 report is not at "需修复项：0"`);
      }
      if (result.r2.scopes.length === 0) {
        console.error("  no *-r2-rev*-report.md found in the review dir (R2 not dispatched?)");
      }
      for (const { scope, rev } of result.r2.failing) {
        console.error(`  ${scope} rev${rev}: latest R2 report is not at "需修复项：0"`);
      }
      process.exit(1);
    }
    console.log(
      `[review-gate] OK (P4 exit: R1 zero ${result.r1.scopes
        .map(({ scope, rev }) => `${scope}@rev${rev}`)
        .join(", ")}; R2 zero ${result.r2.scopes
        .map(({ scope, rev }) => `${scope}@rev${rev}`)
        .join(", ")})`,
    );
    return;
  }
  const result = evaluateR2Gate(entries);
  if (!result.ok) {
    console.error("[review-gate] R1 is not at zero; R2 must not start.");
    if (result.scopes.length === 0) {
      console.error("  no *-r1-rev*-report.md found in the review dir");
    }
    for (const { scope, rev } of result.failing) {
      console.error(`  ${scope} rev${rev}: latest R1 report is not at "需修复项：0"`);
    }
    console.error(
      [
        "  hint: after fixing R1 findings, write a targeted confirmation as <scope>-r1-rev<N+1>-report.md.",
        "        The report prefix follows the current phase, not the review content; only after this gate passes",
        "        may you dispatch <scope>-r2-rev<N>-report.md.",
      ].join("\n"),
    );
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
