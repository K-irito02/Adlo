---
name: project-architecture
description: Project-specific architecture rules for AI Digital Life. Use when working on phase boundaries, package/module ownership, dependency direction, Electron layer boundaries, or any cross-module design/implementation decision in this project.
---

# Project Architecture

Use this skill when the task can change system boundaries, package ownership, or phase scope.

## Core rules

- Treat the repo as Phase 0/1 planning and implementation guidance for `AI Digital Life`.
- Keep the architecture layered: desktop shell, application services, system adapters, infrastructure.
- Do not let low-level modules depend on high-level modules.
- Do not let Renderer own business rules or direct system access.
- Prefer small, stable packages with clear responsibilities.

## Phase constraints

- Phase 0 is the runnable desktop foundation.
- Phase 1 is the interactive MVP loop.
- Do not introduce Phase 2+ complexity into Phase 0 without an explicit decision.

## Package ownership expectations

- `desktop-shell`: Main/Preload/Renderer/Worker, IPC, shell safety
- `infra-foundation`: config, logger, errors, storage, migration
- `workspace-retrieval`: workspace, indexing, search, repo map
- `task-governance`: task state, approval, audit, checkpoint references

## Required checks before changing architecture

- Confirm which phase the change belongs to.
- Confirm which layer owns the behavior.
- Confirm whether the change expands privilege or cross-layer coupling.
- Confirm which docs and manifests must be updated.

## Prefer

- Explicit boundaries
- Typed contracts
- Recovery and audit by default
- Small interfaces over broad helper buckets

## Avoid

- Future-proofing by adding heavy abstractions too early
- Cross-layer shortcuts
- Multiple event buses
- Mixing state restoration concerns into UI logic
