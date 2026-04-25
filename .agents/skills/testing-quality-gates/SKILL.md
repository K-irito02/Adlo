---

## name: testing-quality-gates
description: Project-specific test and quality gates for AI Digital Life (Rust + Tauri). Use when implementing or reviewing high-risk changes, defining unit/integration/E2E coverage, building acceptance matrices, or deciding whether a change is safe to land.

# Testing Quality Gates

Use this skill when a task needs verification strength, not just test count.

## Risk-based testing

- Low risk: focused unit validation may be enough (`#[cfg(test)] mod tests` per crate).
- Medium risk: unit plus integration coverage (`tests/integration/`).
- High risk: integration or E2E (`tauri-driver` / WebDriver) evidence plus regression analysis.

## High-risk areas

- Tauri security boundaries (`tauri.conf.json`, `capabilities/*.json`, plugin scopes)
- Tauri Command contracts (input validation, error shape, capability registration)
- SQLite schema and `migration` crate
- Recovery flows and startup lifecycle
- Workspace and retrieval state (`tokio` background tasks)
- Approval and dangerous action governance
- `unsafe` Rust additions

## Required commands before merge

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo check --workspace`
- `cargo test --workspace`
- `npm --prefix frontend run typecheck` and `npm --prefix frontend test`
- For high-risk changes: `cargo tauri build --debug` smoke + relevant E2E

## Required review questions

- What can regress?
- Which crate / Tauri Command owns verification?
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
- skipping clippy by silencing warnings without justification