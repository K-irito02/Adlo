---
name: docs-phase-governance
description: Project-specific documentation and phase-governance rules for AI Digital Life. Use when updating stage docs, AGENTS, manifests, routing rules, architecture notes, or any change that can create drift between implementation guidance and project governance.
---

# Docs Phase Governance

Use this skill when documentation is part of the real source of truth.

## Core rules

- This repo is document-heavy; docs are part of the implementation surface.
- Keep phase boundaries explicit.
- Keep AGENTS, manifests, hooks, and development docs aligned.
- Prefer concise, operational documentation over aspirational prose.

## Must-sync changes

- architecture boundary changes
- phase scope changes
- agent topology or routing changes
- hook policy changes
- security baseline changes
- release or migration policy changes

## Required artifacts

- update the relevant stage document
- update `AGENTS.md` if routing or rules change
- update the related manifest if Agent/skill/hook inventory changes
- update `docs/development/*` when governance behavior changes

## Avoid

- documentation drift
- duplicated rules with conflicting wording
- vague "future" statements that hide present constraints
