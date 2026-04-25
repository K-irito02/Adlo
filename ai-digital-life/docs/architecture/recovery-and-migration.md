# Recovery And Migration

## Current Scope

The repository now includes a standalone `migration` package that provides:

- version detection
- backup creation
- migration registration
- sequential migration running

The desktop runtime now invokes version detection during startup. When the stored version differs from the current app version, it prepares a backup of the local `config` and `state` directories before running registered migration scripts.

The startup path also writes a lifecycle marker file to `state/runtime-status.json`. On the next launch the shell can detect whether the previous shutdown was clean, and the renderer now shows that recovery state together with migration diagnostics.

## Runtime Diagnostics

The desktop UI now exposes a Phase 0 diagnostics summary that includes:

- current process start time
- last shutdown time
- whether the previous exit was clean
- whether recovery was triggered
- migration change type and executed script count
- shared event bus emission counts
- latest recorded runtime error summary
- executed migration script ids and statuses
- the backup path created for an upgrade run, when present

## Recovery Anchors

Approved high-risk requests now create checkpoint metadata records in SQLite. Each checkpoint currently stores:

- workspace id
- session id
- checkpoint type
- descriptive text
- lightweight manifest payload
- affected relative paths inferred from the latest Git snapshot
- summarized dirty-worktree context

In addition, the storage layer now writes a checkpoint payload bundle under `state/checkpoints/<checkpointId>/`:

- `manifest.json` with captured assets and restore preview data
- `files/` containing copied file snapshots for restorable paths that still exist at approval time
- missing-path markers for deleted or unavailable paths

The renderer can now read this payload preview and show how many files were actually captured for the latest checkpoint. It can also invoke a restore action that recopies captured files back into the workspace for the selected checkpoint.

This is sufficient for audit, restore preview, and basic restore execution for captured files. It still does not provide conflict-aware merge recovery or deletion replay.

## Next Gaps

- backup retention and cleanup policy
- richer migration catalog beyond the bootstrap script
- conflict-aware rollback semantics for deleted files and directory removals
- validation and rollback reporting in the desktop UI
# Recovery And Migration

## Runtime Recovery

The desktop runtime keeps a separate lifecycle marker under `state/runtime-status.json`.

When the previous shutdown was unclean, the next startup now performs bounded recovery for the active workspace:

- `running` and `approved` tasks are converted to `failed`
- `waiting-approval` tasks remain approval-bound and are surfaced unchanged
- patch sets stuck in `applying` are converted to `failed`
- agent runs stuck in `planning`, `ready`, `executing`, `waiting-approval`, `applying`, or `verifying` are converted to `failed`
- every recovered item emits an audit record

This recovery step is intentionally conservative:

- it does not silently replay commands
- it does not silently re-apply patches
- it does not expand renderer privileges

The user must explicitly retry from the task center or conversation after recovery.

## Migration

SQLite remains the persisted source of truth for runtime state.
Legacy file state is still migrated on first startup, and migration diagnostics continue to be exposed through the desktop health surface.

## Single-Agent State Tables

The backend thin slice stores single-agent runtime metadata in SQLite tables for workspaces, sessions, retrieval snapshots, tasks, approvals, audit records, checkpoints, conversation messages, agent runs and steps, patch sets/file patches/hunks, command requests/executions, validation results, model preferences, and model call audit records.

Checkpoint payloads remain file-backed under `state/checkpoints/<checkpointId>/` so rollback can restore captured workspace-relative file snapshots without granting the WebView direct filesystem access.
