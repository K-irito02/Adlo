---
name: run-project-surfaces
description: Use when the user wants AI Digital Life started in the in-app browser preview, the external Tauri desktop app, or both, and the workflow must choose a free dev port automatically instead of relying on a fixed port.
---

# Run Project Surfaces

Use this skill to start AI Digital Life on the requested runtime surface with dynamic port selection.

## Trigger Mapping

- In-app browser preview only:
  Run `npm run dev:browser` from `E:\Programs\Obsidian\notes\ai-digital-life`.
- External desktop app only:
  Run `npm run dev:tauri` from `E:\Programs\Obsidian\notes\ai-digital-life`.
- Both browser preview and desktop app:
  Run `npm run dev:both` from `E:\Programs\Obsidian\notes\ai-digital-life`.

## Rules

- Prefer the mode the user explicitly requested; do not start both unless they asked for both or it is necessary for verification.
- Use the root scripts above instead of `cargo tauri dev` directly. Those scripts choose a free port, boot Vite first, then pass the resolved `devUrl` into Tauri.
- When browser preview is requested, report the emitted local URL back to the user **as plain text** (not wrapped in backticks), so the user can click it to open in Trae IDE's built-in browser.
- **Do NOT** use agent-browser or any other tool to open the URL after startup. Trae IDE automatically makes plain text URLs clickable in chat messages.
- When the in-app browser plugin is usable, open the reported local URL there. If the plugin is blocked by local runtime issues, say so explicitly and keep the local preview server running.
- When verifying desktop mode, confirm that the Tauri process is running rather than assuming startup succeeded.

## Notes

- Dynamic port selection is implemented in `ai-digital-life/scripts/run-project-surface.mjs`.
- `frontend/vite.config.ts` accepts `ADL_PORT` / `PORT`, so direct frontend runs can also move off a busy port.
- The wrapper keeps the browser preview and Tauri desktop app on the same resolved port for a given run.
