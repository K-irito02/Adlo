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
- Approval decisions are now writable from the renderer and update both task state and audit history.
- Approved high-risk requests create a checkpoint payload bundle and metadata anchor before future execution layers take over.
- Pending approvals can now time out explicitly and write timeout audit records instead of remaining open forever.
- The desktop shell can trigger restore execution from the latest checkpoint payload, and the resulting restore task is recorded as a rollback-style task outcome.

## Present Limits

- Task execution is still shell-owned and synthetic for Phase 0 baseline flows.
- Restore execution currently replays captured files only; it does not yet replay deletions or handle merge conflicts.
