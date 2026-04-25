---

## name: project-architecture

description: Project-specific architecture rules for AI Digital Life (Rust + Tauri). Use when working on phase boundaries, crate ownership, dependency direction, Tauri layer boundaries, or any cross-module design/implementation decision in this project.

# Project Architecture

Use this skill when the task can change system boundaries, crate ownership, or phase scope.

## Core rules

- Treat the repo as Phase 0/1 planning and implementation guidance for `AI Digital Life` (Rust + Tauri 2.x).
- Keep the architecture layered: Tauri shell, application services, system adapters, infrastructure.
- Do not let low-level crates depend on high-level crates.
- Do not let the WebView own business rules or direct system access.
- Prefer small, stable crates with clear responsibilities and a thin public API.

## Phase constraints

- Phase 0 is the runnable Tauri desktop foundation.
- Phase 1 is the interactive MVP loop.
- Do not introduce Phase 2+ complexity into Phase 0 without an explicit decision.

## Crate ownership expectations

- `tauri-shell`: `src-tauri/` (Tauri Builder, Commands, capabilities, event channels)
- `infra-foundation`: `config`, `logger` (tracing), `errors` (thiserror), `storage` (rusqlite), `migration`
- `workspace-retrieval`: `workspace`, `fs-ops` (notify), indexing, search, repo map
- `task-governance`: task state, approval, audit, checkpoint references

## Dependency direction

- `kernel` is the lowest layer; everything else may depend on it; it depends on nothing internal.
- `infra-foundation` crates may depend on `kernel`; not on business crates.
- Business crates (`workspace`, `task`, `conversation`, `agent-runtime`, ...) depend on `infra-foundation` + `kernel`.
- `src-tauri` depends on all of the above; nothing depends on `src-tauri`.

## Required checks before changing architecture

- Confirm which phase the change belongs to.
- Confirm which layer / crate owns the behavior.
- Confirm whether the change expands privilege or cross-layer coupling.
- Confirm which docs and manifests must be updated.

## Prefer

- Explicit boundaries (Tauri Commands as the only WebView surface)
- Typed contracts via `serde` types in `kernel`
- Recovery and audit by default
- Small interfaces over broad helper buckets
- `Result<T, AppError>` over `panic!`

## Avoid

- Future-proofing by adding heavy abstractions too early
- Cross-layer shortcuts (WebView calling plugins directly with broad scope)
- Multiple event buses (use the single `events` crate)
- Mixing state restoration concerns into UI logic
- Circular crate dependencies