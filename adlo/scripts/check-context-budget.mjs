/**
 * Context budget gate: fails when the repo's agent-facing context grows past
 * the agreed budgets. Scope is deliberately the content every session pays
 * for (dual-root AGENTS.md, always-on Trae rules) plus project self-built
 * skills (the repo's own SKILL.md files). Third-party skills are excluded.
 *
 * Ratchet rule: budgets only go DOWN. Raising a budget requires an explicit
 * PR that says why, in docs/development/context-budget.md.
 *
 * Usage: `node scripts/check-context-budget.mjs`
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Budgets in bytes (description in chars). Ratchet: only lower. */
export const BUDGETS = {
  rootAgents: 9 * 1024, // root AGENTS.md (OpenCode injects every session)
  adloAgents: 13 * 1024, // adlo/AGENTS.md (injected for adlo/ work)
  alwaysApplyFile: 16 * 1024, // a single alwaysApply rule
  alwaysApplyTotal: 46 * 1024, // all alwaysApply rules (Trae injects every session)
  selfBuiltSkillFile: 60 * 1024, // one self-built SKILL.md
  selfBuiltSkillTotal: 165 * 1024, // all self-built SKILL.md combined
  selfBuiltSkillDescription: 600, // frontmatter description length
};

/** Anchors referenced by other files; removing one breaks links. */
export const REQUIRED_ANCHORS = {
  "AGENTS.md": ["## 禁止项", "## 双端一致性", "## 项目形态", "## 问题排查与调试"],
  "adlo/AGENTS.md": ["## 调试工具", "## 磁盘空间管理", "## 双端一致性"],
};

/** Parse SKILLS.md §4.3 (项目自建技能) rows; the table is the single source of truth. */
export function parseSelfBuiltSkillNames(skillsMd) {
  const start = skillsMd.indexOf("### 4.3");
  if (start === -1) {
    return [];
  }
  const rest = skillsMd.slice(start);
  const end = rest.indexOf("### 4.4");
  const section = end === -1 ? rest : rest.slice(0, end);
  return [...section.matchAll(/^\| `([^`]+)`/gm)].map((match) => match[1]);
}

/** Extract the frontmatter `description:` value (single line) or "" if absent. */
export function extractDescription(skillMd) {
  const match = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return "";
  }
  const line = match[1].split(/\r?\n/).find((l) => l.startsWith("description:"));
  return line
    ? line
        .slice("description:".length)
        .trim()
        .replace(/^["']|["']$/g, "")
    : "";
}

function readFile(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function byteLength(relative) {
  return fs.statSync(path.join(ROOT, relative)).size;
}

function listRuleFiles() {
  const dir = path.join(ROOT, ".agents/rules");
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md")
    .map((e) => `.agents/rules/${e.name}`)
    .sort();
}

function collectViolations() {
  const violations = [];
  const report = [];
  const check = (label, actual, limit, unit = "bytes") => {
    report.push(`${label}: ${actual}${unit === "bytes" ? " B" : " chars"} (budget ${limit})`);
    if (actual > limit) {
      violations.push(`${label} exceeds budget: ${actual} > ${limit}`);
    }
  };

  // 1) Dual-root AGENTS.md size + required anchors
  for (const [file, anchors] of Object.entries(REQUIRED_ANCHORS)) {
    check(file, byteLength(file), BUDGETS[file === "AGENTS.md" ? "rootAgents" : "adloAgents"]);
    const text = readFile(file);
    for (const anchor of anchors) {
      if (!text.includes(anchor)) {
        violations.push(`${file} is missing required anchor "${anchor}"`);
      }
    }
  }

  // 2) alwaysApply rules (Trae injects these every session)
  const ruleFiles = listRuleFiles();
  const alwaysApply = ruleFiles.filter((file) => /^alwaysApply:\s*true\s*$/m.test(readFile(file)));
  let alwaysTotal = 0;
  for (const file of alwaysApply) {
    const bytes = byteLength(file);
    alwaysTotal += bytes;
    if (bytes > BUDGETS.alwaysApplyFile) {
      violations.push(
        `${file} exceeds alwaysApply per-file budget: ${bytes} > ${BUDGETS.alwaysApplyFile}`,
      );
    }
  }
  check("alwaysApply total (Trae)", alwaysTotal, BUDGETS.alwaysApplyTotal);

  // 3) Project self-built skills (SKILLS.md §4.3 is the list)
  const selfBuilt = parseSelfBuiltSkillNames(readFile("SKILLS.md"));
  let selfBuiltTotal = 0;
  for (const name of selfBuilt) {
    const file = `.agents/skills/${name}/SKILL.md`;
    if (!fs.existsSync(path.join(ROOT, file))) {
      violations.push(`SKILLS.md §4.3 lists "${name}" but ${file} does not exist`);
      continue;
    }
    const text = readFile(file);
    const bytes = Buffer.byteLength(text, "utf8");
    selfBuiltTotal += bytes;
    if (bytes > BUDGETS.selfBuiltSkillFile) {
      violations.push(
        `${file} exceeds self-built skill budget: ${bytes} > ${BUDGETS.selfBuiltSkillFile}`,
      );
    }
    const description = extractDescription(text);
    if (description.length > BUDGETS.selfBuiltSkillDescription) {
      violations.push(
        `${file} description is ${description.length} chars (budget ${BUDGETS.selfBuiltSkillDescription})`,
      );
    }
  }
  check("self-built skills total", selfBuiltTotal, BUDGETS.selfBuiltSkillTotal);

  return { report, violations };
}

function main() {
  const { report, violations } = collectViolations();
  for (const line of report) {
    console.log(`[context-budget] ${line}`);
  }
  if (violations.length > 0) {
    console.error(`[context-budget] FAIL: ${violations.length} violation(s):`);
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }
  console.log("[context-budget] OK");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
