/**
 * 日常门禁：新增/修改的**代码注释**里出现绝对断言或计数断言时失败。
 *
 * 为什么（2026-11-21 retro）：P4 R1 多轮审查的后半场大量在核「注释说 X、代码是 Y」，
 * 每轮成本 = 4 个子代理 + 全量快照。`review-snapshot` 的 claims 门禁是确认制
 * （勾选后放行），不会在写注释时提醒；这里把同一套启发式提前到 `check:changed`，
 * 让作者当场改措辞或加 `claim-allow` 证据。
 *
 * 用法：
 *   node scripts/check-comment-claims.mjs [--base <ref>] [--verbose]
 *
 * 范围：`git diff -U0 --diff-filter=ACMR <base>` 的新增行 + 未跟踪文件；
 * 只看注释行，`.md` 交给 P5 文档审查。行尾 `// claim-allow: <理由>` 显式放行。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatClaim,
  parseDiffClaims,
  scanFileClaims,
  splitDiffByFile,
} from "./comment-claims.mjs";
import { isThirdPartySkillPath } from "./third-party-skills.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const implRoot = path.resolve(scriptDir, "..");

// 第三方技能是上游治理内容，不是产品代码；其一致性由 check-agent-dirs 与
// check-context-budget 治理。注释断言门禁只覆盖产品代码，避免上游技能的英文
// 说明性注释会显著增加日常门禁噪声。

// `core.quotepath=false`：diff/ls-files 输出原始 UTF-8 路径，便于按仓库相对路径读未跟踪文件。
// 剥离 hook 注入的仓库环境变量，避免子进程按另一套仓库布局解析路径。
function gitEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_PREFIX;
  return env;
}

function git(args, cwd) {
  return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    // 大合并（origin/main 落后数十提交）的 diff 可远超默认 1MB；不设上限会让
    // check:comment-claims 在 pre-push 以 ENOBUFS 假失败（2026-11-22 实测）。
    maxBuffer: 64 * 1024 * 1024,
    env: gitEnv(),
  });
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const parsed = { base: null, verbose: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") {
      parsed.base = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith("--base=")) {
      parsed.base = arg.slice("--base=".length);
    } else if (arg === "--verbose") {
      parsed.verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function resolveBase(explicit, repoRoot) {
  if (explicit) {
    git(["rev-parse", "--verify", explicit], repoRoot);
    return explicit;
  }
  const upstream = tryGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], repoRoot);
  if (upstream) {
    return upstream.trim();
  }
  if (tryGit(["rev-parse", "--verify", "origin/main"], repoRoot)) {
    return "origin/main";
  }
  return "HEAD";
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("usage: node scripts/check-comment-claims.mjs [--base <ref>] [--verbose]");
    return;
  }
  const repoRoot = git(["rev-parse", "--show-toplevel"], implRoot).trim();
  const base = resolveBase(options.base, repoRoot);
  const changed = git(["diff", "--name-only", "--diff-filter=ACMR", base], repoRoot)
    .split(/\r?\n/)
    .filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard"], repoRoot)
    .split(/\r?\n/)
    .filter(Boolean);

  const hits = [];
  for (const chunk of splitDiffByFile(git(["diff", "-U0", "--diff-filter=ACMR", base], repoRoot))) {
    if (chunk.file.endsWith(".md") || isThirdPartySkillPath(chunk.file)) {
      continue;
    }
    hits.push(...parseDiffClaims(chunk.text, chunk.file));
  }
  for (const file of untracked) {
    if (file.endsWith(".md") || isThirdPartySkillPath(file)) {
      continue;
    }
    try {
      hits.push(...scanFileClaims(readFileSync(path.join(repoRoot, file), "utf8"), file));
    } catch {
      // 二进制 / 不可读文件：跳过
    }
  }

  if (options.verbose) {
    console.log(
      `[comment-claims] base=${base} changed=${changed.length} untracked=${untracked.length}`,
    );
  }
  if (hits.length === 0) {
    console.log("[comment-claims] ok");
    return;
  }
  console.error("[comment-claims] 新增注释里有无法从代码直接证明的断言：");
  for (const hit of hits.slice(0, 50)) {
    console.error(`  - ${formatClaim(hit)}`);
  }
  if (hits.length > 50) {
    console.error(`  … 其余 ${hits.length - 50} 条省略`);
  }
  console.error(
    '[comment-claims] 改写为可验证表述（“当前实现…”/“本用例覆盖…”），或在该行加 "claim-allow: <证据>"。',
  );
  process.exit(1);
}

main();
