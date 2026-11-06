/**
 * 审查快照生成器（root-cause-to-close P4 用）。
 *
 * 一条命令完成：解析 base → `git add -N` 未跟踪文件 → 每文件写 diff 快照 →
 * 写 changed-files / commits 清单。取代手工拼 `git diff` 的三种典型事故：
 * - `--output` 写在 `--` 之后会被当成 pathspec（不写文件、整段 diff 进 stdout）；
 * - 未跟踪文件不进 `git diff`（漏审新文件）；
 * - 空 diff 静默通过。
 *
 * 用法：
 *   node scripts/review-snapshot.mjs [--base <ref>] [--out <dir>] [--rev <N>]
 *     [--allow-untracked] [--allow-claims]
 * 默认 base = merge-base(origin/HEAD, HEAD)，无远端时 HEAD；out = 仓库根 .review-diffs。
 *
 * 未跟踪的纯数字名 / `.tmp/.log/.out/.bak` 会被拒绝（审查子代理临时产物）。
 * 新增注释里的绝对断言必须先在 claims-ack-rev<N>.md 逐条标 [x]，否则退出码为 1。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

function git(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || "").trim()}`);
  }
  return (result.stdout || "").trim();
}

function splitLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 文件名 → Windows/POSIX 安全快照名（保持可读：只替换分隔符与保留字符）。 */
export function safeSnapshotName(file) {
  return file.replace(/[\\/:*?"<>|]/g, "_");
}

export function parseArgs(argv) {
  const options = {
    base: null,
    out: ".review-diffs",
    rev: 1,
    help: false,
    allowUntracked: false,
    allowClaims: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--allow-untracked") {
      options.allowUntracked = true;
      continue;
    }
    if (arg === "--allow-claims") {
      options.allowClaims = true;
      continue;
    }
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`missing value for ${arg}`);
      }
      i += 1;
      return value;
    };
    if (arg === "--base") {
      options.base = next();
    } else if (arg === "--out") {
      options.out = next();
    } else if (arg === "--rev") {
      const rev = Number(next());
      if (!Number.isInteger(rev) || rev <= 0) {
        throw new Error("--rev must be a positive integer");
      }
      options.rev = rev;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function resolveBase(explicit) {
  if (explicit) {
    git(["rev-parse", "--verify", explicit]);
    return explicit;
  }
  const hasOriginHead = spawnSync("git", ["rev-parse", "--verify", "origin/HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (hasOriginHead.status === 0) {
    return git(["merge-base", "origin/HEAD", "HEAD"]);
  }
  console.warn("[review-snapshot] origin/HEAD unavailable; falling back to HEAD");
  return "HEAD";
}

/**
 * 审查子代理曾把临时输出重定向到 `adlo/frontend/11` / `12`，随后被
 * `git add -N` 带进快照。这里只拦“纯数字名 / 临时扩展名”这类高置信度产物；
 * 正常新增源码不受影响。误报时用 `--allow-untracked`。
 */
const TEMP_BASENAME_PATTERN = /^\d+$|\.(?:tmp|log|out|bak)$/i;

export function findSuspiciousUntracked(files) {
  return files.filter((file) => {
    const normalized = file.replace(/\\/g, "/");
    const base = normalized.split("/").at(-1) ?? "";
    return TEMP_BASENAME_PATTERN.test(base);
  });
}

function stageIntentToAdd(allowUntracked) {
  const untracked = splitLines(git(["ls-files", "--others", "--exclude-standard"]));
  if (untracked.length === 0) {
    return 0;
  }
  const suspicious = findSuspiciousUntracked(untracked);
  if (suspicious.length > 0 && !allowUntracked) {
    throw new Error(
      [
        "refusing to snapshot suspicious untracked files:",
        ...suspicious.map((file) => `  - ${file}`),
        "Move temporary output to $env:TEMP or .review-diffs/tmp, or pass --allow-untracked.",
      ].join("\n"),
    );
  }
  // 分批避免 Windows 命令行长度上限。
  for (let i = 0; i < untracked.length; i += 50) {
    git(["add", "-N", "--", ...untracked.slice(i, i + 50)]);
  }
  return untracked.length;
}

/** 注释里的「绝对断言」：默认门控，确认后由 claims-ack 放行。 */
const CLAIM_PATTERN = /必然|总是|永远|从不|唯一|一定|不可达|不会走到|always|never|unreachable/i;
const COMMENT_LINE_PATTERN = /^\s*(\/\/|\/\*|\*|<!--)/;

/**
 * 从本轮快照里挑出「新增注释 + 绝对断言」的行，写 `claims-rev<N>.md`。
 *
 * 为什么需要：R1/R2 的后半场经常全在核「注释说 X、代码是 Y」。压到审查发现前，
 * 让作者先自读一遍最便宜；这是启发式（只覆盖代码注释，不覆盖文档散文），
 * 未在 claims-ack-rev<N>.md 逐条确认时阻断快照生成（`--allow-claims` 可放行）。
 */
function collectClaimHints(files, outDir, rev) {
  const hints = [];
  for (const file of files) {
    // Markdown prose belongs to P5 docs review; this heuristic targets code comments.
    if (file.endsWith(".md")) {
      continue;
    }
    const diffPath = path.join(outDir, `${safeSnapshotName(file)}-rev${rev}.diff`);
    if (!fs.existsSync(diffPath)) {
      continue;
    }
    let newLine = 0;
    for (const line of fs.readFileSync(diffPath, "utf8").split(/\r?\n/)) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (hunk) {
        newLine = Number(hunk[1]);
        continue;
      }
      if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("\\")) {
        continue;
      }
      if (line.startsWith("+")) {
        const text = line.slice(1);
        if (COMMENT_LINE_PATTERN.test(text) && CLAIM_PATTERN.test(text)) {
          hints.push({ file, line: newLine, text: text.trim() });
        }
        newLine += 1;
      } else if (!line.startsWith("-")) {
        newLine += 1;
      }
    }
  }
  if (hints.length === 0) {
    return { hints: [], count: 0 };
  }
  const body = [
    `# 待自读的断言 — rev${rev}`,
    "",
    "下面是本轮**新增注释**里含绝对断言（必然/总是/永远/不会/不可达/唯一/always/never…）的行。",
    "派发审查前逐条自读：它与**最终代码**相符吗？能由某个测试或分支证明吗？不能就降级措辞。",
    "",
    ...hints.slice(0, 100).map((hit) => `- ${hit.file}:${hit.line} — ${hit.text}`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, `claims-rev${rev}.md`), body, "utf8");
  return { hints, count: hints.length };
}

function claimKey(hit) {
  return `${hit.file}:${hit.line}`;
}

/** Ack 文件里每个 claim 必须有一行 `- [x] file:line — evidence`。 */
export function validateClaimAck(ackText, hints) {
  const lines = ackText.split(/\r?\n/);
  const missing = hints.filter(
    (hit) => !lines.some((line) => line.includes(claimKey(hit)) && /\[x\]/i.test(line)),
  );
  return { ok: missing.length === 0, missing };
}

function writeClaimAckTemplate(ackPath, rev, hints) {
  if (fs.existsSync(ackPath)) {
    return;
  }
  const body = [
    `# Claims ack — rev${rev}`,
    "",
    "逐条核对注释与最终代码/测试；确认后把 `[ ]` 改成 `[x]`，并在 `—` 后写证据或降级措辞。",
    "",
    ...hints.map((hit) => `- [ ] ${claimKey(hit)} — ${hit.text}`),
    "",
  ].join("\n");
  fs.writeFileSync(ackPath, body, "utf8");
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[review-snapshot] ${error.message}`);
    process.exit(1);
  }
  if (options.help) {
    console.log(
      "usage: node scripts/review-snapshot.mjs [--base <ref>] [--out <dir>] [--rev <N>] [--allow-untracked] [--allow-claims]",
    );
    return;
  }

  const base = resolveBase(options.base);
  const outDir = path.resolve(repoRoot, options.out);
  fs.mkdirSync(outDir, { recursive: true });

  let intended;
  try {
    intended = stageIntentToAdd(options.allowUntracked);
  } catch (error) {
    console.error(`[review-snapshot] ${error.message}`);
    process.exit(1);
  }
  const files = splitLines(git(["diff", "--name-only", base]));
  if (files.length === 0) {
    console.error(`[review-snapshot] no changes against base ${base}; nothing to snapshot`);
    process.exit(1);
  }

  for (const file of files) {
    const diffPath = path.join(outDir, `${safeSnapshotName(file)}-rev${options.rev}.diff`);
    // --output 必须在 `--` 之前：放到 `--` 之后会被 git 当成 pathspec（本仓实测）。
    git(["diff", `--output=${diffPath}`, base, "--", file]);
  }

  const rev = options.rev;
  const claimResult = collectClaimHints(files, outDir, rev);
  const claims = claimResult.count;
  fs.writeFileSync(
    path.join(outDir, `changed-files-rev${rev}.txt`),
    `${files.join("\n")}\n`,
    "utf8",
  );
  const commits = git(["log", "--oneline", `${base}..HEAD`]);
  fs.writeFileSync(path.join(outDir, `commits-rev${rev}.txt`), `${commits}\n`, "utf8");

  const groups = new Map();
  for (const file of files) {
    const group = file.startsWith("adlo/crates/")
      ? "backend (crates)"
      : file.startsWith("adlo/frontend/")
        ? "frontend"
        : file.startsWith("docs/") || file === "CONTEXT.md" || file === "GLOSSARY.md"
          ? "docs"
          : "other";
    groups.set(group, [...(groups.get(group) ?? []), file]);
  }
  const groupLines = [...groups.entries()]
    .map(([group, entries]) =>
      [`### ${group} (${entries.length})`, ...entries.map((file) => `- ${file}`)].join("\n"),
    )
    .join("\n\n");
  const manifest = [
    `# Review manifest — rev${rev}`,
    "",
    `- base: \`${base}\``,
    `- commits: ${commits ? commits.split("\n").length : 0}`,
    `- files: ${files.length}`,
    "",
    "## 快照命名",
    "",
    `仓库相对路径中的 \`/\` 和 \`.\` 换成 \`_\`，后缀 \`-rev${rev}.diff\`。只看本轮 rev，不要复用旧快照。`,
    "",
    "## 子代理共享简报",
    "",
    "`.agents/skills/root-cause-to-close/references/review-brief.md`（规约、气味基线、强制检查项、报告契约）。",
    "",
    "## 文件分组",
    "",
    groupLines,
    "",
  ].join("\n");
  const manifestPath = path.join(outDir, `manifest-rev${rev}.md`);
  fs.writeFileSync(manifestPath, manifest, "utf8");

  console.log(
    `[review-snapshot] base=${base} rev=${rev} files=${files.length} intent-to-add=${intended}`,
  );
  console.log(`[review-snapshot] out=${path.relative(repoRoot, outDir) || "."}`);
  console.log(`[review-snapshot] manifest=${path.relative(repoRoot, manifestPath)}`);
  if (claims > 0) {
    console.log(`[review-snapshot] claims=${claims} (见 claims-rev${rev}.md，派发前自读)`);
    if (!options.allowClaims) {
      const ackPath = path.join(outDir, `claims-ack-rev${rev}.md`);
      writeClaimAckTemplate(ackPath, rev, claimResult.hints);
      const ackText = fs.existsSync(ackPath) ? fs.readFileSync(ackPath, "utf8") : "";
      const ack = validateClaimAck(ackText, claimResult.hints);
      if (!ack.ok) {
        console.error(
          [
            `[review-snapshot] claims not acknowledged (${ack.missing.length} missing):`,
            ...ack.missing.map((hit) => `  - ${claimKey(hit)}`),
            `Fill ${path.relative(repoRoot, ackPath)} with "- [x] file:line — evidence", then rerun.`,
            "Use --allow-claims only when every absolute claim is verified by code or a test.",
          ].join("\n"),
        );
        process.exitCode = 1;
      }
    }
  }
  for (const file of files) {
    console.log(`  ${safeSnapshotName(file)}-rev${rev}.diff`);
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  main();
}
