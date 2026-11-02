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
 * 默认 base = merge-base(origin/HEAD, HEAD)，无远端时 HEAD；out = 仓库根 .review-diffs。
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
  const options = { base: null, out: ".review-diffs", rev: 1, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
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

function stageIntentToAdd() {
  const untracked = splitLines(git(["ls-files", "--others", "--exclude-standard"]));
  if (untracked.length === 0) {
    return 0;
  }
  // 分批避免 Windows 命令行长度上限。
  for (let i = 0; i < untracked.length; i += 50) {
    git(["add", "-N", "--", ...untracked.slice(i, i + 50)]);
  }
  return untracked.length;
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
    console.log("usage: node scripts/review-snapshot.mjs [--base <ref>] [--out <dir>] [--rev <N>]");
    return;
  }

  const base = resolveBase(options.base);
  const outDir = path.resolve(repoRoot, options.out);
  fs.mkdirSync(outDir, { recursive: true });

  const intended = stageIntentToAdd();
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
  fs.writeFileSync(
    path.join(outDir, `changed-files-rev${rev}.txt`),
    `${files.join("\n")}\n`,
    "utf8",
  );
  const commits = git(["log", "--oneline", `${base}..HEAD`]);
  fs.writeFileSync(path.join(outDir, `commits-rev${rev}.txt`), `${commits}\n`, "utf8");

  const groups = new Map();
  for (const file of files) {
    const group = file.startsWith("ai-digital-life/crates/")
      ? "backend (crates)"
      : file.startsWith("ai-digital-life/frontend/")
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
