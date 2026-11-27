# Retro Environment Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all six retrospective findings with testable CLI tooling and precise rule/skill pointers, then merge to main, align three worktrees, and push both remotes.

**Architecture:** Add focused Node CLIs for logged long commands, review report artifacts, local signed packages, Retro summaries, and release preflight. Keep existing build/signature/review gates as the single source of truth; new scripts orchestrate them. Documentation points to the new commands at the decision site.

**Tech Stack:** Node.js `node:test`, existing pnpm scripts, Markdown governance docs, existing release/review tooling.

**Spec:** `docs/superpowers/specs/2026-11-28-retro-environment-design.md`

## Global Constraints

- Reuse `slot-2`; do not change branch binding.
- TDD for every new script: write failing tests, verify red, implement minimal green.
- No new dependencies.
- Never print signing private keys, passwords, tokens, or sanitized transcript bodies.
- `.agents/` is canonical; sync `.opencode/` and `.trae/` mirrors after edits.
- No version bump, Release, tag, or update manifest publication.
- Final push only through `pnpm --dir adlo run push:both -- main slot-1 slot-2`.

## Review Focus

- Long-command worker records exit code and complete log even when the caller disconnects.
- Report validator rejects malformed zero counts and missing artifacts before the gate.
- Local package backup never overwrites prior backups or archive directories.
- Preflight reports secret presence as booleans only.
- Retro summary tolerates the export's leading session-ID line and redacted content.
- Async testing guidance distinguishes visible content from effect/listener readiness.

---

### Task 1: Logged long-command runner

**Files:**
- Create: `adlo/scripts/run-logged.mjs`
- Create: `adlo/scripts/run-logged.test.mjs`
- Modify: `adlo/package.json`
- Modify: `.agents/rules/commands.md`
- Modify: `.agents/rules/quality-gates.md`
- Modify: `.agents/skills/adlo-release/SKILL.md`

**Interfaces:**
- Produces: `parseArgs`, `buildPaths`, `runWorker`, `startLogged`, `waitLogged`, `statusLogged`, `tailLogged`.
- CLI: `run:logged start|wait|status|tail --name <name> -- <command>`.

- [x] Write tests for argument parsing, log/result paths, tail bounding, worker success/failure exit codes, and missing result behavior.
- [x] Run `node --test adlo/scripts/run-logged.test.mjs` and verify failures.
- [x] Implement detached worker + result JSON + wait/status/tail commands.
- [x] Add `run:logged`, `check:all:log`, `release:build:log`, `wait:logged` package scripts.
- [x] Point quality/release docs to logged commands.
- [x] Run focused tests and `check:script-lint`.

### Task 2: Review report artifact CLI

**Files:**
- Create: `adlo/scripts/review-report.mjs`
- Create: `adlo/scripts/review-report.test.mjs`
- Modify: `adlo/package.json`
- Modify: `.agents/skills/root-cause-to-close/references/review-brief.md`
- Modify: `.agents/skills/root-cause-to-close/SKILL.md`

**Interfaces:**
- Produces: `createReport`, `validateReport`.
- CLI: `review:report create <path> --scope <scope> --phase <r1|r2> --rev <n>` and `review:report check <path>`.

- [x] Write tests for skeleton creation, exact zero line, non-zero counts, malformed counts, missing sections, and missing file.
- [x] Run focused tests and verify red.
- [x] Implement create/check commands with non-zero exit on invalid artifacts.
- [x] Add `review:report` package script.
- [x] Update review contract to require artifact check before `check-review-gate`.
- [x] Run focused tests.

### Task 3: Local signed-package automation

**Files:**
- Create: `adlo/scripts/release/local-package.mjs`
- Create: `adlo/scripts/release-local.mjs`
- Create: `adlo/scripts/release-local.test.mjs`
- Modify: `adlo/package.json`
- Modify: `.agents/skills/adlo-release/SKILL.md`

**Interfaces:**
- Produces: `planArchivePath`, `backupExistingArtifacts`, `archiveLocalPackage`, `summarizePackage`.
- CLI: `release:build:local` backs up old artifacts, calls existing `release:build -- --local`, verifies signature, archives by `v<ver>-pre-<sha>`.

- [x] Write temp-root tests for archive naming, backup movement, collision refusal, copied artifact set, and summary fields.
- [x] Run focused tests and verify red.
- [x] Implement pure filesystem helpers and CLI orchestration around existing release/signature scripts.
- [x] Add `release:build:local` and `release:local:verify` package scripts.
- [x] Replace manual local-package recipe with the command.
- [x] Run focused tests.

### Task 4: Retro session summary CLI

**Files:**
- Create: `adlo/scripts/retro-summary.mjs`
- Create: `adlo/scripts/retro-summary.test.mjs`
- Modify: `adlo/package.json`
- Modify: `.agents/skills/retro/SKILL.md`

**Interfaces:**
- Produces: `parseSessionExport`, `summarizeSession`.
- CLI: `retro:summary <export-file> [--since <epoch-ms>]`.

- [x] Write fixture tests for leading session-ID line, message/tool counts, durations, token peaks, errors, repeated calls, and `--since` filtering.
- [x] Run focused tests and verify red.
- [x] Implement parser/summarizer without reading redacted body text.
- [x] Add `retro:summary` package script and skill pointer.
- [x] Run focused tests.

### Task 5: Release preflight CLI

**Files:**
- Create: `adlo/scripts/release/preflight.mjs`
- Create: `adlo/scripts/release-preflight.mjs`
- Create: `adlo/scripts/release-preflight.test.mjs`
- Modify: `adlo/package.json`
- Modify: `.agents/skills/adlo-release/SKILL.md`

**Interfaces:**
- Produces: `inspectVersions`, `resolveSigningConfig`, `collectPreflight`.
- CLI: `release:preflight` prints a read-only report and exits non-zero on blockers.

- [x] Write temp-root tests for three-version consistency, signing config booleans, dirty-tree blockers, archive collision, and secret non-disclosure.
- [x] Run focused tests and verify red.
- [x] Implement pure inspectors and CLI using Git/PowerShell/disk probes.
- [x] Add `release:preflight` package script and invoke it in the release skill.
- [x] Run focused tests.

### Task 6: Async testing and reviewer rules

**Files:**
- Modify: `.agents/rules/mandatory-testing.md`
- Modify: `.agents/rules/review-judgements.md`

**Interfaces:**
- Produces: documented content-readiness vs behavior-readiness contract and reviewer checklist item.

- [ ] Rewrite async rendering guidance with the two readiness classes and Escape/listener example.
- [ ] Add reviewer checklist item requiring observable effect/listener readiness.
- [ ] Run `check:docs-links`, `check:skills`, `check:context-budget`.

### Task 7: Mirrors, verification, commit, integration

**Files:**
- Modify: generated `.opencode/` and `.trae/` mirrors via repository scripts.
- Modify: plan/spec checkboxes as tasks complete.

- [ ] Run all focused script tests, `check:script-lint`, `scripts:format:check`, `check:docs-links`, `check:skills`, `check:context-budget`, `check:repo`.
- [ ] Confirm three skill/rule trees match.
- [ ] Commit on `slot-2` with a conventional message.
- [ ] Fast-forward `main`, align `slot-1` and `slot-2`.
- [ ] Run approved `check:all` on merged `main` with logged output.
- [ ] Push `main slot-1 slot-2` through `push:both` and verify both remote SHAs.
- [ ] Close the session registry and report final hash/status.
