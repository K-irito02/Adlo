# Task Governance

## Current Phase 0 Scope

The implementation now persists:

- tasks
- approval requests
- audit records
- latest session summary

These records live in SQLite and currently back the home-shell governance panel.

## Runtime Rules

- Task orchestration remains separate from command execution.
- High-risk work is represented as approval-bound state, not as direct renderer powers.
- Dirty worktree conflicts can surface a pending approval request before future risky actions.
- Every system-created task and approval request appends an audit record.

## Present Limits

- Approval decisions are not yet writable from the UI.
- Task execution is still shell-owned and synthetic for Phase 0 baseline flows.
- Checkpoint records are not yet persisted.
