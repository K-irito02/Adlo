---

## name: desktop-tauri-security
description: Project-specific Tauri and desktop security rules for AI Digital Life. Use when working on Rust Backend, Tauri Commands, WebView Frontend, capability/permission files, tauri.conf.json security, secret handling, file access boundaries, or any task that can expand desktop privileges.

# Desktop Tauri Security

Use this skill for any task that touches the Tauri desktop shell or security boundaries.

## Security baseline

- `tauri.conf.json` `app.security.csp` must be explicitly declared (no empty CSP).
- `withGlobalTauri` must be `false`; frontend imports `@tauri-apps/api` explicitly.
- WebView must not access system primitives directly.
- Tauri Commands form the only bridge surface; each window's `capabilities/*.json` lists allowed commands.
- High-permission plugins (`tauri-plugin-fs`, `tauri-plugin-shell`, `tauri-plugin-http`) must use scope restrictions; never `"all"` or `"**"`.

## Tauri Command rules

- Use capability allowlists; never expose a command without registering it in `capabilities/*.json`.
- Use typed request/response contracts via `serde` types from the `kernel` crate.
- Return `Result<T, AppError>` (structured, serializable failures) rather than raw `panic!` or unstructured errors.
- Validate all inputs explicitly; never trust frontend payloads.
- Long-running commands must be `async` and use `tokio::spawn` / `spawn_blocking` to avoid blocking the event loop.
- Do not expose arbitrary command, file, process, or SQL execution to the WebView.

## Secret handling

- Never place secrets in `tauri.conf.json`, plain YAML/JSON config, or `localStorage`.
- Never log tokens, keys, or credential-bearing payloads (audit `tracing` instrumentation).
- Use the `keyring` crate to access OS credential storage (Windows Credential Manager / macOS Keychain / Linux Secret Service).

## Boundary checks

- Classify all write targets: app dir, user data dir, workspace dir.
- Tauri `fs` plugin scopes must mirror this classification.
- Escalate any privilege expansion (new capability, new plugin, broader scope).
- Treat dangerous command or destructive Git flows as approval-bound.

## Rust unsafe and dependency hygiene

- Justify every `unsafe` block with a comment describing the invariants.
- Prefer safe abstractions; use `unsafe` only when crossing FFI or proven-hot paths.
- Run `cargo deny` / `cargo audit` for dependency vulnerabilities at release prep.

## Review triggers

Bring in `app-security` when a task changes:

- Tauri Command exposure or capability files
- `tauri.conf.json` security fields (CSP, `withGlobalTauri`, plugin config)
- secret storage behavior (`keyring` usage)
- write or execute permissions / plugin scopes
- `unsafe` Rust additions
- dangerous action policy