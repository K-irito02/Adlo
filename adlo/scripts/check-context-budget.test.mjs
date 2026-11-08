import test from "node:test";
import assert from "node:assert/strict";
import {
  BUDGETS,
  REQUIRED_ANCHORS,
  parseSelfBuiltSkillNames,
  extractDescription,
} from "./check-context-budget.mjs";

const SKILLS_MD_FIXTURE = `# SKILLS

### 4.3 项目自建技能（2）

| 技能目录 | 调用名 | 说明 |
|----------|--------|------|
| \`alpha-skill\` | \`alpha-skill\` | 自建技能 A |
| \`beta-skill\` | \`beta-skill\` | 自建技能 B |

### 4.4 Matt Pocock 技能（1）

| 技能目录 | 调用名 | 说明 |
|----------|--------|------|
| \`mc-skill\` | \`mc-skill\` | 社区技能 C |
`;

test("parseSelfBuiltSkillNames reads only the §4.3 table", () => {
  assert.deepEqual(parseSelfBuiltSkillNames(SKILLS_MD_FIXTURE), ["alpha-skill", "beta-skill"]);
});

test("parseSelfBuiltSkillNames returns [] when §4.3 is absent", () => {
  assert.deepEqual(parseSelfBuiltSkillNames("# no sections here"), []);
});

test("extractDescription reads a single-line frontmatter description", () => {
  const md = `---\nname: x\ndescription: 中文描述 some words\nalwaysApply: true\n---\n\nbody`;
  assert.equal(extractDescription(md), "中文描述 some words");
});

test("extractDescription strips surrounding quotes and returns '' without frontmatter", () => {
  assert.equal(extractDescription(`---\ndescription: "quoted"\n---\nbody`), "quoted");
  assert.equal(extractDescription("no frontmatter"), "");
});

test("budgets are defined and positive", () => {
  for (const [key, value] of Object.entries(BUDGETS)) {
    assert.ok(value > 0, `${key} budget must be positive`);
  }
});

test("required anchors are declared for both AGENTS.md files", () => {
  assert.deepEqual(Object.keys(REQUIRED_ANCHORS).sort(), ["AGENTS.md", "adlo/AGENTS.md"]);
  for (const anchors of Object.values(REQUIRED_ANCHORS)) {
    assert.ok(anchors.length >= 2);
  }
});
