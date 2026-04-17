---
name: desktop-electron-security
description: Project-specific Electron and desktop security rules for AI Digital Life. Use when working on Main/Preload/Renderer/Worker, IPC contracts, BrowserWindow options, secret handling, file access boundaries, or any task that can expand desktop privileges.
---

# Desktop Electron Security

Use this skill for any task that touches the desktop shell or security boundaries.

## Security baseline

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- Renderer must not access system primitives directly.
- Preload exposes only minimal typed APIs.

## IPC rules

- Use allowlisted channels only.
- Use typed request/response contracts.
- Return structured failures rather than raw exceptions.
- Do not expose arbitrary command, file, process, or SQL execution to Renderer.

## Secret handling

- Never place secrets in plain YAML/JSON config.
- Never log tokens, keys, or credential-bearing payloads.
- Prefer system credential storage.

## Boundary checks

- Classify all write targets: app dir, user data dir, workspace dir.
- Escalate any privilege expansion.
- Treat dangerous command or destructive Git flows as approval-bound.

## Review triggers

Bring in `app-security` when a task changes:

- IPC exposure
- BrowserWindow security flags
- secret storage behavior
- write or execute permissions
- dangerous action policy
