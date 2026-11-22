import assert from "node:assert/strict";
import { test } from "node:test";
import { isThirdPartySkillPath, readThirdPartySkillNames } from "./third-party-skills.mjs";

test("reads third-party names from the install lock", () => {
  const names = readThirdPartySkillNames();
  assert.ok(names.has("taste-skill"));
  assert.ok(names.has("brainstorming"));
  assert.equal(names.has("parallel-branch-development"), false);
});

test("matches third-party skills in all three mirrors", () => {
  for (const root of [".agents", ".opencode", ".trae"]) {
    assert.equal(isThirdPartySkillPath(`${root}/skills/taste-skill/scripts/x.mjs`), true);
    assert.equal(isThirdPartySkillPath(`${root}/skills/brainstorming/SKILL.md`), true);
  }
});

test("does not match project-built skills or product code", () => {
  assert.equal(isThirdPartySkillPath(".agents/skills/parallel-branch-development/SKILL.md"), false);
  assert.equal(isThirdPartySkillPath("adlo/frontend/src/app/App.tsx"), false);
  assert.equal(isThirdPartySkillPath(".agents/skills/taste-skill"), false);
  assert.equal(isThirdPartySkillPath("adlo/scripts/check-source-hygiene.mjs"), false);
});

test("accepts Windows separators", () => {
  assert.equal(isThirdPartySkillPath(".agents\\skills\\taste-skill\\scripts\\gate.mjs"), true);
});
