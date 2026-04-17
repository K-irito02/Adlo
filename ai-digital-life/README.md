# AI Digital Life Thin Slice

This workspace contains the first runnable Phase 0 thin slice for `AI Digital Life`.

## Governance

- [AGENTS.md](/E:/Programs/Obsidian/notes/ai-digital-life/AGENTS.md)
- [CONTRIBUTING.md](/E:/Programs/Obsidian/notes/ai-digital-life/CONTRIBUTING.md)
- [System Overview](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/system-overview.md)
- [Tech Stack Alignment](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/tech-stack-alignment.md)

## Current Scope

- Electron desktop shell with `Main / Preload / Renderer / Worker`
- Typed, allowlisted IPC bridge
- SQLite-backed recent workspace open and restore flow
- Retrieval worker driven workspace scan and status reporting
- Health status and log summary on the home screen
- Manual approval shell with task queue and pending-approval placeholders
- Runtime language switch (`zh-CN` / `en-US`)
- Runtime theme switch (`light` / `dark`) persisted to config

## Out Of Scope For This Slice

- Model routing
- Command execution
- Patch application
- Full `stageOne` infrastructure coverage for `events`, persistent task center, session summaries, Git snapshots, and migration workflows

## StageOne Status

This repository does **not** fully implement `digitalLife/aiFunction-Implementation/stageOne` yet.

The current codebase now covers a broader Phase 0 home shell:

- workspace open and recent restore
- retrieval worker status
- health and logs
- preference controls
- approval shell entry UI

Still missing for full `stageOne` completion:

- formal event bus package
- persistent task / approval storage and audit chain
- session summary and checkpoint metadata
- Git snapshot protection
- schema migration and upgrade workflows
- full packaging, E2E, and release-readiness layers

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
