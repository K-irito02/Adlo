# AI Digital Life Thin Slice

This workspace contains the first runnable Phase 0 thin slice for `AI Digital Life`.

## Governance

- [AGENTS.md](/E:/Programs/Obsidian/notes/ai-digital-life/AGENTS.md)
- [CONTRIBUTING.md](/E:/Programs/Obsidian/notes/ai-digital-life/CONTRIBUTING.md)
- [System Overview](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/system-overview.md)
- [Tech Stack Alignment](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/tech-stack-alignment.md)
- [StageOne Validation](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/stage-one-validation.md)

## Current Scope

- Electron desktop shell with `Main / Preload / Renderer / Worker`
- Typed, allowlisted IPC bridge
- SQLite-backed recent workspace open and restore flow
- Retrieval worker driven workspace scan and status reporting
- Health status and log summary on the home screen
- Manual approval shell with task queue and pending-approval placeholders
- Runtime language switch (`zh-CN` / `en-US`)
- Runtime theme switch (`light` / `dark`) persisted to config
- Persisted workspace/session/task/approval/audit metadata in SQLite
- Basic Git dirty-worktree snapshot and approval trigger shell
- Standalone `events` and `task` packages for Phase 0 governance primitives
- Runtime event emission for app, workspace, retrieval, task, and approval flows
- Approval decision write-back with checkpoint metadata anchors
- Checkpoint payload bundles with captured file snapshots and restore preview metadata
- Checkpoint restore execution from captured payload bundles
- Startup recovery markers, migration evaluation, and diagnostics surfaced in the UI
- Default registered migration scripts with backup path and execution status diagnostics
- Standalone `migration` package with version detection, backup, and runner execution skeleton

## Out Of Scope For This Slice

- Model routing
- Command execution
- Patch application
- Full `stageOne` infrastructure coverage for `events`, persistent task center, session summaries, Git snapshots, and migration workflows

## StageOne Status

This repository now covers the `stageOne` runtime-facing Phase 0 baseline and has a concrete validation summary in `docs/architecture/stage-one-validation.md`.

The current codebase now covers the full Phase 0 desktop runtime path:

- workspace open and recent restore
- retrieval worker status
- health and logs
- preference controls
- approval shell entry UI
- startup recovery markers and recovery diagnostics
- migration detection, backup preparation, and upgrade diagnostics
- restore execution from the latest checkpoint payload
- cross-module event emission through the shared event bus
- checkpoint payload capture plus restore preview metadata

Still worth improving after `stageOne` baseline completion:

- broader packaging and installer validation
- richer migration and restore semantics

## Tech Stack Note

This thin slice follows the `stageOne` technology direction, but currently lands only the subset already needed for Phase 0 runtime validation. The exact alignment and deferred stack items are tracked in `docs/architecture/tech-stack-alignment.md`.

## Commands

```bash
npm install
npm run build
npm run test
npm run start
```

`pnpm-workspace.yaml` is included because the target layout is still a `pnpm workspace`, but the scripts are also `npm workspace` compatible for environments where `pnpm` is not yet provisioned.
