---
name: testing-quality-gates
description: Project-specific test and quality gates for AI Digital Life. Use when implementing or reviewing high-risk changes, defining unit/integration/E2E coverage, building acceptance matrices, or deciding whether a change is safe to land.
---

# Testing Quality Gates

Use this skill when a task needs verification strength, not just test count.

## Risk-based testing

- Low risk: focused unit validation may be enough.
- Medium risk: unit plus integration coverage.
- High risk: integration or E2E evidence plus regression analysis.

## High-risk areas

- Electron security boundaries
- IPC contracts
- storage schema and migration
- recovery flows
- workspace and retrieval state
- approval and dangerous action governance

## Required review questions

- What can regress?
- What layer owns verification?
- What evidence proves the risky behavior is safe?
- If tests cannot run, what gap remains?

## Output expectations

- proposed tests or validation path
- acceptance criteria
- residual risks
- blockers if verification is incomplete

## Avoid

- adding tests that do not cover the actual risk
- declaring safety without evidence
