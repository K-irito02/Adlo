# Task Governance

## Current Phase 0 Scope

The implementation now persists:

- tasks
- approval requests
- audit records
- latest session summary

These records live in SQLite and currently back the home-shell governance panel.

Phase 2 tranche 1 additionally persists:

- conversation sessions and messages
- single-agent run metadata and plan steps
- patch-set, file-patch, and hunk decision state
- model provider preference metadata in the config layer
- command requests, command execution summaries, validation results, and model call audit metadata

## Runtime Rules

- Task orchestration remains separate from command execution.
- High-risk work is represented as approval-bound state, not as direct renderer powers.
- Dirty worktree conflicts can surface a pending approval request before future risky actions.
- Every system-created task and approval request appends an audit record.
- Approval decisions are now writable from the renderer and update both task state and audit history.
- Approved high-risk requests create a checkpoint payload bundle and metadata anchor before future execution layers take over.
- Pending approvals can now time out explicitly and write timeout audit records instead of remaining open forever.
- The desktop shell can trigger restore execution from the latest checkpoint payload, and the resulting restore task is recorded as a rollback-style task outcome.
- Patch application in the Phase 2 workspace shell remains explicit and checkpoint-backed; the renderer can review and change hunk decisions but cannot write files directly.
- Patch application now drives a minimal validation loop: the system selects a workspace validation command, stores the execution record, persists structured validation output, and rolls back automatically when verification fails.
- Single-agent execution now routes through real `DeepSeek` and `MiniMax` providers when configured, with a synthetic fallback only after both providers fail.
- Validation failure can generate one conservative repair preview; it does not auto-apply the follow-up change.
- Backend command execution now uses `command + args[]` by default, assigns low/medium/high risk, and creates approval-bound task records for medium/high-risk commands.
- Patch application now validates the original file hash, creates a checkpoint payload, applies accepted hunks only, stores validation output, and rolls back when validation fails.

## Present Limits

- Task execution is still shell-owned and synthetic for Phase 0 baseline flows.
- Restore execution currently replays captured files only; it does not yet replay deletions or handle merge conflicts.
- More advanced model routing telemetry, streaming outputs, and multi-step automatic repair loops remain incomplete.
