# Retro Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all eight environment and process issues found in the current session retrospective.

**Architecture:** Add deterministic guards where the failure is mechanical (log truncation, scopes parsing, report/glossary contracts), and add sharp reviewer/skill pointers where the failure is judgement-based (child WebView E2E stop condition, ADR supersession, retro session export, commit hash reporting).

**Tech Stack:** Node.js CLI scripts and `node:test`, Markdown skills/rules, existing repository mirror checks.

**Spec:** Current session retrospective delivered on 2026-11-28.

## Global Constraints

- Reuse `slot-2`; do not change branch binding.
- Mechanical failures get tests before implementation.
- Skill/rule sources live under `.agents/`; `.opencode/` and `.trae/` are generated mirrors and must be byte-identical.
- Do not run full `check:all` or workspace-wide tests without user approval.
- Final hash is reported in the session summary, not embedded in the commit being created.

## Review Focus

- Ultra-long UTF-8 log lines remain bounded while preserving both prefix and suffix.
- `--scopes` accepts inline JSON and file paths without ambiguous path resolution.
- Zero-finding review reports satisfy the gate without manual phrasing patches.
- A child WebView E2E failure stops before repeated builds and switches evidence source.
- Later ADR branches update earlier ADR status/consequences in the same change.

---

### Task 1: Bound log output

**Files:**
- Modify: `adlo/scripts/log-tail.mjs`
- Create or modify: `adlo/scripts/log-tail.test.mjs`
- Modify: `.agents/skills/root-cause-to-close/SKILL.md`
- Modify: `adlo/AGENTS.md`

**Interfaces:**
- Produces: `truncateLine(line, maxChars)` behavior and CLI flag `--max-line-chars` with default `800`.

- [x] Add tests for short lines, long CJK/JSON lines, prefix/suffix preservation, and invalid limits.
- [x] Run `node --test adlo/scripts/log-tail.test.mjs` and verify the new truncation assertions fail.
- [x] Implement bounded line output and usage text.
- [x] Run the test file and verify all cases pass.

### Task 2: Accept inline or file-based review scopes

**Files:**
- Modify: `adlo/scripts/review-snapshot.mjs`
- Modify: `adlo/scripts/review-snapshot.test.mjs`

**Interfaces:**
- Produces: `--scopes` accepts either a JSON object string or a path to a JSON file.

- [x] Add a CLI test passing inline JSON and a test preserving existing file-path behavior.
- [x] Run the focused tests and verify inline JSON currently fails.
- [x] Implement inline/file detection and update usage text.
- [x] Run focused tests and verify both forms pass.

### Task 3: Align review and glossary contracts

**Files:**
- Modify: `.agents/skills/root-cause-to-close/references/review-brief.md`
- Modify: `adlo/skills-overlays/domain-modeling/glossary-gates.overlay`
- Apply the overlay to the ignored `.agents/skills/domain-modeling/GLOSSARY-FORMAT.md` source and mirror it

**Interfaces:**
- Produces: zero-finding reports must contain `- 需修复项：0`; glossary definitions use plain text or links, not emphasis.

- [x] Update the review report contract to require the exact gate phrase.
- [x] Update glossary format guidance to match `check:glossary`.
- [x] Run `check:glossary` and review-gate script tests.

### Task 4: Add reviewer and skill stop conditions

**Files:**
- Modify: `.agents/rules/review-judgements.md`
- Modify: `.agents/skills/desktop-e2e-wdio/SKILL.md`
- Modify: `.agents/skills/retro/SKILL.md`
- Modify: `adlo/skills-overlays/retro/session-evidence.overlay`

**Interfaces:**
- Produces: reviewers enforce ADR supersession; WDIO stops on child-WebView handle loss; retro uses `opencode session export --sanitize`.

- [x] Add the ADR branch-supersession review rule.
- [x] Add the child-WebView WDIO stop condition.
- [x] Add exact retro session export commands.
- [x] Run rule/skill mirror checks.

### Task 5: Remove commit-hash self reference

**Files:**
- Modify: `.agents/skills/root-cause-to-close/SKILL.md`
- Modify: `docs/root-cause-to-close/_template.md`

**Interfaces:**
- Produces: P6 records the commit subject; final hash appears only in the session summary.

- [x] Update P6 summary and progress template wording.
- [x] Run skill mirror checks.

### Task 6: Verify and commit

**Files:**
- Modify: generated `.opencode/` and `.trae/` mirrors via repository scripts.

- [x] Run focused Node tests for changed scripts.
- [x] Run `check:glossary`, `check:docs-links`, `check:skills`, and `check:repo` if scope remains documentation/tooling only.
- [x] Confirm three skill directories are byte-identical.
- [x] Commit with a conventional message; report final hash only in the session summary.

## Review Follow-up

- [x] Keep log truncation on UTF-16 code-unit budgets without splitting surrogate pairs; add emoji-boundary coverage.
- [x] Parse the final review conclusion as an integer zero with optional annotation; reject `0.5` / `0/1` / `0abc`.
- [x] Split glossary overlays into minimal independent anchors and test them against pristine upstream content.
- [x] Prefer existing scopes files, reject non-object JSON, and validate scopes before CLI base resolution; add relative-path, brace-filename, and spawned-CLI coverage.
