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

## Out Of Scope For This Slice

- Task approvals
- Model routing
- Command execution
- Patch application

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
