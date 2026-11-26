import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guards the repo's dual-source governance layout:
 * `.agents/{rules,skills}` are the only editable copies; `.opencode` and `.trae`
 * must stay byte-identical. The summary counts in RULES.md / SKILLS.md must also
 * match the directories, otherwise agents navigate by stale numbers.
 *
 * Runs from pre-commit (`node --test "scripts/*.test.mjs"`), so drift fails the
 * next commit instead of being noticed weeks later.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const MIRRORS = [".opencode", ".trae"];

function listFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push(relative(root, full).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return files.sort();
}

function fileDigest(fullPath) {
  const buffer = readFileSync(fullPath);
  // Windows worktrees may check text out as CRLF while the canonical blob is LF.
  // Treat NUL-containing files as binary and hash raw bytes; normalize line
  // endings for text so the mirror guard does not fail on checkout style.
  if (!buffer.includes(0)) {
    const text = buffer.toString("utf8");
    if (!text.includes("\uFFFD")) {
      return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
    }
  }
  return createHash("sha256").update(buffer).digest("hex");
}

function snapshot(root) {
  return new Map(listFiles(root).map((file) => [file, fileDigest(join(root, file))]));
}

function assertMirror(sourceDir, mirrorRoot) {
  const source = snapshot(join(repoRoot, sourceDir));
  const mirror = snapshot(join(repoRoot, mirrorRoot, sourceDir.split("/").at(-1)));

  const missing = [...source.keys()].filter((file) => !mirror.has(file));
  const extra = [...mirror.keys()].filter((file) => !source.has(file));
  assert.deepEqual(missing, [], `${mirrorRoot} is missing files from ${sourceDir}`);
  assert.deepEqual(extra, [], `${mirrorRoot} has files absent from ${sourceDir}`);

  const changed = [...source.entries()]
    .filter(([file, hash]) => mirror.get(file) !== hash)
    .map(([file]) => file);
  assert.deepEqual(changed, [], `${mirrorRoot} differs from ${sourceDir} (content)`);
}

function readDoc(name) {
  return readFileSync(join(repoRoot, name), "utf8");
}

function matchNumber(text, pattern, label) {
  const match = text.match(pattern);
  assert.ok(match, `${label} not found`);
  return Number(match[1]);
}

const skillDirs = readdirSync(join(repoRoot, ".agents/skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const ruleFiles = readdirSync(join(repoRoot, ".agents/rules"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
  .map((entry) => entry.name)
  .sort();

test("rules mirrors are byte-identical to .agents/rules", () => {
  for (const mirror of MIRRORS) {
    assertMirror(".agents/rules", mirror);
  }
});

test("skill mirrors are byte-identical to .agents/skills", () => {
  for (const mirror of MIRRORS) {
    assertMirror(".agents/skills", mirror);
  }
});

test("every skill directory has a SKILL.md", () => {
  for (const skill of skillDirs) {
    assert.doesNotThrow(
      () => readFileSync(join(repoRoot, ".agents/skills", skill, "SKILL.md")),
      `${skill} is missing SKILL.md`,
    );
  }
});

test("SKILLS.md counts and summary index match the skill directories", () => {
  const doc = readDoc("SKILLS.md");

  assert.equal(
    matchNumber(doc, /\| \*\*合计\*\* \|[^|\n]*\| \*\*(\d+)\*\* \|/, "SKILLS.md total"),
    skillDirs.length,
    "SKILLS.md total does not match .agents/skills",
  );

  const projectSelfBuilt = matchNumber(
    doc,
    /\| 项目自建技能 \|[^|\n]*\| (\d+) \|/,
    "SKILLS.md project self-built count",
  );
  const section4 = doc.split("## 4. 技能摘要")[1] ?? "";
  const selfBuiltSection = section4.split("### 4.3")[1]?.split("### 4.4")[0] ?? "";
  const selfBuiltRows = [...selfBuiltSection.matchAll(/^\| `([^`]+)`/gm)].map((m) => m[1]);
  assert.equal(projectSelfBuilt, selfBuiltRows.length, "§4.3 row count != §1.1 count");
  assert.equal(
    matchNumber(section4, /### 4\.3 项目自建技能（(\d+)）/, "§4.3 header count"),
    selfBuiltRows.length,
    "§4.3 header count != row count",
  );

  const categoryCounts = [...section4.matchAll(/### 4\.\d [^（\n]*（(\d+)）/g)].map((m) =>
    Number(m[1]),
  );
  assert.equal(
    categoryCounts.reduce((sum, count) => sum + count, 0),
    skillDirs.length,
    "§4 category counts do not sum to the skill directory count",
  );

  const indexed = new Set([...section4.matchAll(/^\| `([^`]+)`/gm)].map((match) => match[1]));
  const missing = skillDirs.filter((skill) => !indexed.has(skill));
  const extra = [...indexed].filter((skill) => !skillDirs.includes(skill));
  assert.deepEqual(missing, [], "skills missing from SKILLS.md §4");
  assert.deepEqual(extra, [], "SKILLS.md §4 lists nonexistent skills");
});

test("third-party skills stay out of git in all three skill trees", () => {
  const lock = JSON.parse(readFileSync(join(repoRoot, ".agents/.skill-lock.json"), "utf8"));
  const documented = new Set(
    [...readDoc("SKILLS.md").matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]),
  );
  const candidates = [];
  for (const name of Object.keys(lock.skills ?? {})) {
    // lock 里还留着历史条目；只有 SKILLS.md 收录且磁盘存在的才算“已安装”
    if (!documented.has(name)) continue;
    if (!existsSync(join(repoRoot, ".agents/skills", name, "SKILL.md"))) continue;
    for (const tree of [".agents/skills", ".opencode/skills", ".trae/skills"]) {
      const rel = `${tree}/${name}/SKILL.md`;
      if (existsSync(join(repoRoot, rel))) {
        candidates.push(rel);
      }
    }
  }
  // 全新克隆尚未 restore 时没有第三方技能，本检查无事可做
  if (candidates.length === 0) {
    return;
  }

  const result = spawnSync("git", ["check-ignore", "--stdin"], {
    cwd: repoRoot,
    input: candidates.join("\n"),
    encoding: "utf8",
  });
  const ignored = new Set((result.stdout ?? "").split(/\r?\n/).filter(Boolean));
  const leaking = candidates.filter((rel) => !ignored.has(rel));
  assert.deepEqual(
    leaking,
    [],
    "third-party skills must stay out of the remote: add `<tree>/<skill>/` for each leaked path " +
      "to the third-party block at the end of .gitignore",
  );
});

test("agent memory stays out of git and stays ignored", () => {
  const tracked = execFileSync("git", ["ls-files", ".workbuddy/memory"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
  assert.deepEqual(
    tracked,
    [],
    ".workbuddy/memory is a per-machine log: keep it untracked (parallel worktrees share these paths)",
  );

  const ignored = spawnSync("git", ["check-ignore", "-q", ".workbuddy/memory/2099-01-01.md"], {
    cwd: repoRoot,
  });
  assert.equal(ignored.status, 0, ".workbuddy/memory/ must be listed in .gitignore");
});

test("no tracked files live in nested .agents directories", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
  const nested = tracked.filter(
    (file) => /(^|\/)\.agents\//i.test(file) && !file.startsWith(".agents/"),
  );
  assert.deepEqual(
    nested,
    [],
    "nested .agents/ directories must not be tracked (analysis artifacts belong in temp, not git)",
  );
});

test("alwaysApply:false rules carry globs or are registered as on-demand in RULES.md", () => {
  const doc = readDoc("RULES.md");
  const falseRow = doc.match(/\| `alwaysApply: false` \| \d+ \|[^\n]*\|/);
  assert.ok(falseRow, "RULES.md §1.3 must have an alwaysApply:false row");
  const onDemand = [...falseRow[0].matchAll(/\`([a-z0-9-]+\.md)\`/g)].map((m) => m[1]);
  for (const file of onDemand) {
    assert.ok(ruleFiles.includes(file), `on-demand registration ${file} does not exist`);
  }
  const offenders = [];
  for (const file of ruleFiles) {
    const head = readFileSync(join(repoRoot, ".agents/rules", file), "utf8");
    if (/^alwaysApply:\s*true\s*$/m.test(head)) continue;
    if (/^globs:\s*\S/m.test(head)) continue;
    if (!onDemand.includes(file)) offenders.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    "rules with neither a globs field nor an on-demand registration would never be injected",
  );
});

test("RULES.md counts and rule index match .agents/rules", () => {
  const doc = readDoc("RULES.md");

  assert.equal(
    matchNumber(doc, /当前 \*\*(\d+) 条规则\*\*/, "RULES.md rule count"),
    ruleFiles.length,
    "RULES.md rule count does not match .agents/rules",
  );

  const alwaysApply = ruleFiles.filter((file) =>
    /^alwaysApply:\s*true\s*$/m.test(readFileSync(join(repoRoot, ".agents/rules", file), "utf8")),
  );
  const globbed = ruleFiles.filter((file) =>
    /^alwaysApply:\s*false\s*$/m.test(readFileSync(join(repoRoot, ".agents/rules", file), "utf8")),
  );
  assert.equal(
    matchNumber(doc, /\| `alwaysApply: true` \| (\d+) \|/, "RULES.md alwaysApply:true count"),
    alwaysApply.length,
    "RULES.md alwaysApply:true count is stale",
  );
  assert.equal(
    matchNumber(doc, /\| `alwaysApply: false`[^|]*\| (\d+) \|/, "RULES.md alwaysApply:false count"),
    globbed.length,
    "RULES.md alwaysApply:false count is stale",
  );

  const alwaysSection = doc.split("**始终应用的")[1]?.split("> 其余")[0] ?? "";
  const alwaysListed = [...alwaysSection.matchAll(/^\| `([^`]+)`/gm)].map((m) => m[1]);
  assert.deepEqual(
    alwaysListed.sort(),
    alwaysApply.map((file) => file).sort(),
    "RULES.md always-apply list does not match frontmatter",
  );

  const indexSection = doc.split("## 6. 规则清单")[1] ?? "";
  const indexed = new Set([...indexSection.matchAll(/^\| `([^`]+)`/gm)].map((m) => m[1]));
  const missing = ruleFiles.filter((file) => !indexed.has(file));
  const extra = [...indexed].filter((file) => !ruleFiles.includes(file));
  assert.deepEqual(missing, [], "rules missing from RULES.md §6");
  assert.deepEqual(extra, [], "RULES.md §6 lists nonexistent rule files");
});
