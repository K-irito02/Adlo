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
 *     [--allow-untracked] [--allow-claims] [--exclude-generated] [--include-docs]
 * 默认 base = merge-base(origin/HEAD, HEAD)，无远端时 HEAD；out = 仓库根 .review-diffs。
 * `--exclude-generated` 不给生成物写 diff（仍列进 changed-files 与 manifest），
 * 用于动辄数 MB 的生成数据；生成物由对应生成器与漂移门禁负责。
 * 默认排除文档（`docs/**`、根治理文档、`.agents|.opencode|.trae/**`）：P4 只审代码，
 * 文档事实与措辞由 P5 统一同步；确需一并审查时传 `--include-docs`。
 *
 * 未跟踪的纯数字名 / `.tmp/.log/.out/.bak` 会被拒绝（审查子代理临时产物）。
 * 新增注释里的绝对断言必须先在 claims-ack-rev<N>.md 逐条标 [x]，否则退出码为 1。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { findLatestProgressFile, hasP3P4Approval } from "./check-review-gate.mjs";
import { claimKind, isCommentLine } from "./comment-claims.mjs";

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

/** 生成物：`*.generated.ts` / `*.generated.css` 与 `generated/` 目录。 */
export function isGeneratedArtifact(file) {
  const normalized = file.replace(/\\/g, "/");
  return (
    /\.generated\.(?:ts|tsx|js|jsx|css)$/i.test(normalized) ||
    /(?:^|\/)generated\//i.test(normalized)
  );
}

/**
 * 单文件归属匹配：精确路径、`dir/**` 前缀、或含 `*` 的简单 glob。
 * 用途见 `--scopes`：每个文件只应属于一个审查 scope。
 */
export function matchesScopePattern(file, pattern) {
  const f = file.replace(/\\/g, "/");
  const p = pattern.replace(/\\/g, "/");
  if (p.endsWith("/**")) {
    const prefix = p.slice(0, -2);
    return f === prefix.slice(0, -1) || f.startsWith(prefix);
  }
  if (p.includes("*")) {
    const escaped = p
      .split("**")
      .map((segment) =>
        segment
          .split("*")
          .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join("[^/]*"),
      )
      .join(".*");
    return new RegExp(`^${escaped}$`).test(f);
  }
  return f === p;
}

/**
 * 从 `--scopes <json>` 构建归属表。JSON 形状：
 *   { "<scope>": ["path/exact.ts", "path/dir/**", "path/*.rs"], ... }
 * 返回每个 scope 命中的文件、重复归属（同一文件命中多个 scope）与未归属文件。
 * 重复归属必须阻断：两个子代理会重复审同一行并互相触发复审。
 */
export function buildScopeOwnership(files, scopeMap) {
  const entries = [];
  const owners = new Map();
  for (const [scope, patterns] of Object.entries(scopeMap)) {
    if (!Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== "string")) {
      throw new Error(`scope "${scope}" must be an array of path strings`);
    }
    const matched = files.filter((file) =>
      patterns.some((pattern) => matchesScopePattern(file, pattern)),
    );
    entries.push({ scope, files: matched });
    for (const file of matched) {
      owners.set(file, [...(owners.get(file) ?? []), scope]);
    }
  }
  const duplicates = [...owners.entries()]
    .filter(([, scopes]) => scopes.length > 1)
    .map(([file, scopes]) => ({ file, scopes }));
  const unowned = files.filter((file) => !owners.has(file));
  return { entries, duplicates, unowned };
}

/** 文档/治理文件：P4 不审（P5 统一同步），避免文档措辞把审查轮次拖长。 */
const ROOT_DOC_FILES = new Set([
  "AGENTS.md",
  "CONTEXT.md",
  "CONTRIBUTING.md",
  "FUTURE-ROADMAP.md",
  "GLOSSARY.md",
  "README.md",
  "RELEASE-CHECKLIST.md",
  "RULES.md",
  "SECURITY.md",
  "SKILLS.md",
]);

export function isDocsArtifact(file) {
  const normalized = file.replace(/\\/g, "/");
  return (
    normalized.startsWith("docs/") ||
    normalized.startsWith(".agents/") ||
    normalized.startsWith(".opencode/") ||
    normalized.startsWith(".trae/") ||
    normalized === "adlo/AGENTS.md" ||
    normalized === "adlo/README.md" ||
    normalized === "adlo/CONTRIBUTING.md" ||
    ROOT_DOC_FILES.has(normalized)
  );
}

export function parseArgs(argv) {
  const options = {
    base: null,
    out: ".review-diffs",
    rev: 1,
    help: false,
    allowUntracked: false,
    allowClaims: false,
    excludeGenerated: false,
    includeDocs: false,
    progress: null,
    scopes: null,
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
    if (arg === "--exclude-generated") {
      options.excludeGenerated = true;
      continue;
    }
    if (arg === "--include-docs") {
      options.includeDocs = true;
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
    } else if (arg === "--progress") {
      options.progress = next();
    } else if (arg === "--scopes") {
      options.scopes = next();
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

/**
 * 从本轮快照里挑出「新增注释 + 断言类措辞」的行，写 `claims-rev<N>.md`。
 *
 * 为什么需要：R1/R2 的后半场经常全在核「注释说 X、代码是 Y」。压到审查发现前，
 * 让作者先自读一遍最便宜；这是启发式（只覆盖代码注释，不覆盖文档散文），
 * 未在 claims-ack-rev<N>.md 逐条确认时阻断快照生成（`--allow-claims` 可放行）。
 * `kind`: `absolute`（必然/唯一…）或 `numeric`（计数/上限，容易随实现漂移）。
 */
export function collectClaimHints(files, outDir, rev) {
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
        if (isCommentLine(text)) {
          const kind = claimKind(text);
          if (kind) {
            hints.push({ file, line: newLine, text: text.trim(), kind });
          }
        }
        newLine += 1;
      } else if (!line.startsWith("-")) {
        newLine += 1;
      }
    }
  }
  const claimsPath = path.join(outDir, `claims-rev${rev}.md`);
  const ackPath = path.join(outDir, `claims-ack-rev${rev}.md`);
  if (hints.length === 0) {
    // 同 rev 重新生成且已无断言：清掉上一轮的 claims/ack，避免审查代理读取过期清单
    // （本仓实测：修复措辞后 rev1 的旧 claims 文件留在目录里，导致一次假阳性复审）。
    fs.rmSync(claimsPath, { force: true });
    fs.rmSync(ackPath, { force: true });
    return { hints: [], count: 0 };
  }
  const absolute = hints.filter((hit) => hit.kind === "absolute");
  const numeric = hints.filter((hit) => hit.kind === "numeric");
  const section = (title, items) =>
    items.length === 0
      ? []
      : [
          `## ${title}`,
          "",
          ...items.slice(0, 100).map((hit) => `- ${hit.file}:${hit.line} — ${hit.text}`),
          "",
        ];
  const body = [
    `# 待自读的断言 — rev${rev}`,
    "",
    "派发审查前逐条自读：它与**最终代码**相符吗？能由某个测试或分支证明吗？不能就降级措辞或改成不写具体计数。",
    "",
    ...section("绝对断言（必然/唯一/不可达/always/never…）", absolute),
    ...section("数字断言（计数/上限/通过数——最容易随实现漂移）", numeric),
  ].join("\n");
  fs.writeFileSync(claimsPath, body, "utf8");
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

/**
 * 写/补 ack 模板：同一 rev 重新生成时保留已勾选条目，并跨 rev 携带——
 * 本仓实测：同一条断言（DUP_NODES 注释中的「同名…path+depth 相同」）跨 rev1..rev8 措辞不变，
 * 但 claims-ack 按 rev 独立落盘导致每轮都要重抄；改后按 `file:line` 与断言文本双向匹配前一轮 ack。
 * 只补新增未勾选项，已勾选条目逐条保留。
 */
export function writeClaimAckTemplate(ackPath, rev, hints) {
  let existing = "";
  try {
    existing = fs.readFileSync(ackPath, "utf8");
  } catch {
    existing = "";
  }
  const existingKeys = new Set();
  const existingChecked = new Set();
  const existingCheckedText = new Map();
  for (const line of existing.split(/\r?\n/)) {
    const m = /^-\s*\[(x| )\]\s+(\S+)\s*—\s*(.*)$/.exec(line);
    if (!m) {
      const loose = /^-\s*\[(x| )\]\s+(\S+)/.exec(line);
      if (loose) {
        existingKeys.add(loose[2]);
        if (/x/i.test(loose[1])) {
          existingChecked.add(loose[2]);
        }
      }
      continue;
    }
    existingKeys.add(m[2]);
    if (/x/i.test(m[1])) {
      existingChecked.add(m[2]);
      existingCheckedText.set(m[2], (m[3] ?? "").trim());
    }
  }
  const priorText = new Set();
  const priorCheckedKeys = new Set();
  const priorEvidence = new Map();
  const outDir = path.dirname(ackPath);
  try {
    for (const name of fs.readdirSync(outDir)) {
      const m = /^claims-ack-rev(\d+)\.md$/.exec(name);
      if (!m || Number(m[1]) === rev) {
        continue;
      }
      for (const line of fs.readFileSync(path.join(outDir, name), "utf8").split(/\r?\n/)) {
        const m2 = /^-\s*\[(x| )\]\s+(\S+)(?:\s+—\s+(.+))?$/.exec(line);
        if (!m2 || !/x/i.test(m2[1])) {
          continue;
        }
        // 证据文本可能被人工改写成解释（如「删除性推演会变红」），不能只靠它
        // 判断 carry；`file:line` 是 claims 的稳定键（行号漂移时仍由文本兜底）。
        priorCheckedKeys.add(m2[2]);
        if (m2[3]) {
          const evidence = m2[3].trim();
          priorText.add(evidence);
          priorEvidence.set(m2[2], evidence);
        }
      }
    }
  } catch {
    // outDir 不可读（部分测试场景）—— 退化为不跨 rev 携带
  }
  const body = [];
  body.push(`# Claims ack — rev${rev}`);
  body.push("");
  body.push(
    "派发审查前逐条自读：它与**最终代码**相符吗？能由某个测试或分支证明吗？不能就降级措辞或改成不写具体计数。跨 rev 同 key 或同文案断言会自动沿用上一 rev 的勾选。",
  );
  body.push("");
  for (const hit of hints) {
    const key = claimKey(hit);
    const carry =
      !existingChecked.has(key) && (priorCheckedKeys.has(key) || priorText.has(hit.text));
    const checked = existingChecked.has(key) || carry;
    const CARRIED_SUFFIX = "（carried over from previous rev）";
    const suffix = checked && !existingChecked.has(key) ? CARRIED_SUFFIX : "";
    // 人工写下的证据优先于断言原文：脚本重写模板时曾把「- [x] file:line — 证据：…」
    // 覆写成断言原文，审查方因此看不到放行理由（2026-11-14 retro）。
    // 跨 rev 携带的证据里可能已经带过 carried 后缀；先剥掉再决定是否追加，
    // 否则会逐轮累积成「（carried…）（carried…）…」（2026-11-21 retro）。
    const custom = (existingCheckedText.get(key) ?? priorEvidence.get(key) ?? "")
      .split(CARRIED_SUFFIX)
      .join("")
      .trim();
    const keepCustom = custom.length > 0 && !custom.startsWith(hit.text);
    body.push(`- ${checked ? "[x]" : "[ ]"} ${key} — ${keepCustom ? custom : hit.text}${suffix}`);
  }
  body.push("");
  fs.writeFileSync(ackPath, body.join("\n"), "utf8");
}

/**
 * 与上一 rev 的 claims 比对并打印：identical → 提示 ack carry-over 有效，无需重新勾选；
 * 有新增/变更行 → 列出，提醒逐条重验（line 漂移、措辞变化都会使 carry 失配，模板会漏勾）。
 * 这是「绑定 claims 与 ack」的可见性补充——carry 本身已由 writeClaimAckTemplate 按 file:line+文本双向匹配。
 */
function reportClaimsDelta(outDir, rev) {
  let prev = 0;
  try {
    for (const name of fs.readdirSync(outDir)) {
      const m = /^claims-rev(\d+)\.md$/.exec(name);
      if (m && Number(m[1]) < rev) {
        prev = Math.max(prev, Number(m[1]));
      }
    }
  } catch {
    return;
  }
  if (prev === 0) {
    return;
  }
  const readBullets = (revNo) => {
    try {
      return new Set(
        fs
          .readFileSync(path.join(outDir, `claims-rev${revNo}.md`), "utf8")
          .split(/\r?\n/)
          .filter((line) => line.startsWith("- "))
          .map((line) => line.trim()),
      );
    } catch {
      return null;
    }
  };
  const prevSet = readBullets(prev);
  const curSet = readBullets(rev);
  if (!prevSet || !curSet) {
    return;
  }
  if (prevSet.size === curSet.size && [...curSet].every((b) => prevSet.has(b))) {
    console.log(
      `[review-snapshot] claims identical to rev${prev} — carried ack applies; no new [x] required`,
    );
    return;
  }
  const added = [...curSet].filter((b) => !prevSet.has(b));
  console.warn(
    `[review-snapshot] claims changed vs rev${prev}: ${added.length} new/changed line(s) — re-check ack:`,
  );
  for (const b of added) {
    console.warn(`  + ${b}`);
  }
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
      "usage: node scripts/review-snapshot.mjs [--base <ref>] [--out <dir>] [--rev <N>] [--progress <file>] [--scopes <json>] [--allow-untracked] [--allow-claims] [--exclude-generated] [--include-docs]",
    );
    return;
  }

  if (options.rev === 1) {
    const progressFile = options.progress
      ? path.resolve(repoRoot, options.progress)
      : findLatestProgressFile(repoRoot);
    if (!progressFile || !fs.existsSync(progressFile)) {
      console.error(
        "[review-snapshot] P3→P4 approval check failed: progress file not found; pass --progress <file>.",
      );
      process.exit(1);
    }
    if (!hasP3P4Approval(fs.readFileSync(progressFile, "utf8"))) {
      console.error(
        [
          "[review-snapshot] P3→P4 user approval missing; rev1 must not be generated.",
          `  progress: ${progressFile}`,
          '  add: "- P3→P4 用户批准：是（YYYY-MM-DD）" after the user approves,',
          '  or "- P3→P4 用户批准：不需要（用户已明确授权直接收尾）".',
        ].join("\n"),
      );
      process.exit(1);
    }
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
  const generatedFiles = options.excludeGenerated ? files.filter(isGeneratedArtifact) : [];
  const docsFiles = options.includeDocs ? [] : files.filter(isDocsArtifact);
  const reviewFiles = files
    .filter((file) => options.includeDocs || !isDocsArtifact(file))
    .filter((file) => !options.excludeGenerated || !isGeneratedArtifact(file));

  let ownership = null;
  if (options.scopes) {
    const scopesPath = path.resolve(repoRoot, options.scopes);
    let scopeMap;
    try {
      scopeMap = JSON.parse(fs.readFileSync(scopesPath, "utf8"));
    } catch (error) {
      console.error(`[review-snapshot] failed to read --scopes ${scopesPath}: ${error.message}`);
      process.exit(1);
    }
    if (!scopeMap || typeof scopeMap !== "object" || Array.isArray(scopeMap)) {
      console.error("[review-snapshot] --scopes must be a JSON object mapping scope → paths");
      process.exit(1);
    }
    try {
      ownership = buildScopeOwnership(files, scopeMap);
    } catch (error) {
      console.error(`[review-snapshot] invalid --scopes map: ${error.message}`);
      process.exit(1);
    }
    if (ownership.duplicates.length > 0) {
      console.error("[review-snapshot] files assigned to multiple review scopes:");
      for (const { file, scopes } of ownership.duplicates) {
        console.error(`  - ${file}: ${scopes.join(", ")}`);
      }
      console.error("[review-snapshot] assign each file to exactly one scope and retry.");
      process.exit(1);
    }
  }

  for (const file of reviewFiles) {
    const diffPath = path.join(outDir, `${safeSnapshotName(file)}-rev${options.rev}.diff`);
    // --output 必须在 `--` 之前：放到 `--` 之后会被 git 当成 pathspec（本仓实测）。
    git(["diff", `--output=${diffPath}`, base, "--", file]);
  }

  const rev = options.rev;
  const claimResult = collectClaimHints(reviewFiles, outDir, rev);
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
    ...(ownership
      ? [
          "## Scope ownership",
          "",
          "以下归属来自 `--scopes`：每个文件只有一个 owner。子代理只在 owner scope 产出 finding；其他 scope 可只读上下文，避免重复审同一行。",
          ...ownership.entries.map(({ scope, files: scopedFiles }) =>
            [
              "",
              `### ${scope} (${scopedFiles.length})`,
              ...scopedFiles.map((file) => `- ${file}`),
            ].join("\n"),
          ),
          ...(ownership.unowned.length > 0
            ? [
                "",
                `### 未归属 (${ownership.unowned.length})`,
                "",
                "主代理自行归属；未归属文件不进任何 scope 的报告主表。",
                ...ownership.unowned.map((file) => `- ${file}`),
              ]
            : []),
          "",
        ]
      : []),
    ...(generatedFiles.length > 0
      ? [
          "## 生成物（未写 diff）",
          "",
          "以下文件由生成器产出，内容以生成器与漂移门禁为准；不要逐行审查：",
          ...generatedFiles.map((file) => `- ${file}`),
          "",
        ]
      : []),
    ...(docsFiles.length > 0
      ? [
          "## 文档（未写 diff，P5 同步）",
          "",
          "P4 只审代码与代码内注释；以下文档/治理文件的事实与措辞留给 P5 统一同步，不要作为 R1/R2 的需修复项：",
          ...docsFiles.map((file) => `- ${file}`),
          "",
        ]
      : []),
  ].join("\n");
  const manifestPath = path.join(outDir, `manifest-rev${rev}.md`);
  fs.writeFileSync(manifestPath, manifest, "utf8");

  console.log(
    `[review-snapshot] base=${base} rev=${rev} files=${files.length} review=${reviewFiles.length} generated-excluded=${generatedFiles.length} docs-excluded=${docsFiles.length} intent-to-add=${intended}`,
  );
  console.log(`[review-snapshot] out=${path.relative(repoRoot, outDir) || "."}`);
  console.log(`[review-snapshot] manifest=${path.relative(repoRoot, manifestPath)}`);
  if (claims > 0) {
    console.log(`[review-snapshot] claims=${claims} (见 claims-rev${rev}.md，派发前自读)`);
    reportClaimsDelta(outDir, rev);
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
  for (const file of reviewFiles) {
    console.log(`  ${safeSnapshotName(file)}-rev${rev}.diff`);
  }
  for (const file of generatedFiles) {
    console.log(`  ${safeSnapshotName(file)}-rev${rev}.diff (generated, diff skipped)`);
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  main();
}
