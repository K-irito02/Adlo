# Task Governance

> 下文按领域描述现状。

## Persisted Scope

The implementation persists (SQLite):

- tasks
- approval requests
- audit records
- patch-set, file-patch, and hunk decision state
- command requests, command execution summaries, and validation results
- run activity events (per-run replay timeline)
- latest session summary

These records back the home-shell governance panel.

## Runtime Rules

- Task orchestration remains separate from command execution.
- High-risk work is represented as approval-bound state, not as direct renderer powers.
- Dirty worktree conflicts can surface a pending approval request before future risky actions.
- Every system-created task and approval request appends an audit record.
- The system emits a versioned `digital-life://run-activity` event stream for run-level transparency and writes it to SQLite for replay.
- Approval decisions are now writable from the renderer and update both task state and audit history.
- Approved high-risk requests create a checkpoint payload bundle and metadata anchor before future execution layers take over.
- Pending approvals can now time out explicitly and write timeout audit records instead of remaining open forever.
- The desktop shell can trigger restore execution from the latest checkpoint payload, and the resulting restore task is recorded as a rollback-style task outcome.
- Patch application in the workspace shell remains explicit and checkpoint-backed; the renderer can review and change hunk decisions but cannot write files directly.
- Patch application now drives a minimal validation loop: the system selects a workspace validation command, stores the execution record, persists structured validation output, and rolls back automatically when verification fails.
- Validation failure can generate one conservative repair preview; it does not auto-apply the follow-up change.
- Backend command execution now uses `command + args[]` by default, assigns low/medium/high risk, and creates approval-bound task records for medium/high-risk commands.
- Approved command requests now continue into backend execution automatically and persist both execution summaries and audit entries.
- Audit timeline entries are queryable from the renderer, so approvals, patch apply/rollback, validation, and command execution can share one review surface.
- Patch application now validates the original file hash, creates a checkpoint payload, applies accepted hunks only, stores validation output, and rolls back when validation fails.

> Agent 对话、模型接入与编排由第三方 harness（DSH 与 OpenCode CLI）提供，本仓库不实现内置单 Agent 运行时与 Provider 路由（历史文档中的 DeepSeek→MiniMax 双 Provider 描述已失效）。

## Present Limits

- Approved streaming commands do not yet resume as a live stream after approval; they currently complete through the captured backend execution path.
- Restore execution currently replays captured files only; it does not yet replay deletions or handle merge conflicts.
