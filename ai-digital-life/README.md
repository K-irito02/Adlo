# AI Digital Life Thin Slice

This workspace contains the first runnable Phase 0 thin slice for `AI Digital Life`.

## Governance

- [AGENTS.md](/E:/Programs/Obsidian/notes/ai-digital-life/AGENTS.md)
- [CONTRIBUTING.md](/E:/Programs/Obsidian/notes/ai-digital-life/CONTRIBUTING.md)
- [System Overview](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/system-overview.md)
- [Tech Stack Alignment](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/tech-stack-alignment.md)
- [StageOne Validation](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/stage-one-validation.md)

## Current Scope

### Desktop Shell

- Electron desktop shell with `Main / Preload / Renderer / Worker`
- Typed, allowlisted IPC bridge
- Secure BrowserWindow configuration (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`)

### Workspace & Retrieval

- SQLite-backed recent workspace open and restore flow
- Retrieval worker driven workspace scan and status reporting
- Persisted workspace/session/task/approval/audit metadata in SQLite

### Health & Diagnostics

- Health status and log summary on the home screen
- Startup recovery markers, migration evaluation, and diagnostics surfaced in the UI
- Default registered migration scripts with backup path and execution status diagnostics

### Task Governance

- Manual approval shell with task queue and pending-approval placeholders
- Runtime event emission for app, workspace, retrieval, task, and approval flows
- Approval decision write-back with checkpoint metadata anchors
- Checkpoint payload bundles with captured file snapshots and restore preview metadata
- Checkpoint restore execution from captured payload bundles
- Basic Git dirty-worktree snapshot and approval trigger shell

### Preferences

- Runtime language switch (`zh-CN` / `en-US`)
- Runtime theme switch (`light` / `dark` / `system`) persisted to config
- Five color schemes with consistent semantic tokens

### Design System

- Layered CSS architecture: tokens, themes, base, layout, components, utilities
- TypeScript design-system modules: html, icons, theme, components
- WCAG AA color contrast compliance
- Keyboard accessibility and screen-reader friendly markup
- Responsive design down to 640px minimum window width
- Unit test coverage for all public design-system helpers

### Infrastructure Packages

- Standalone `events` package for cross-module event emission
- Standalone `task` package for Phase 0 governance primitives
- Standalone `migration` package with version detection, backup, and runner execution skeleton
- `config`, `logger`, `errors`, `storage`, `workspace`, `kernel` packages

## Out Of Scope For This Slice

- Model routing
- Command execution
- Patch application
- Full `stageOne` infrastructure coverage for `events`, persistent task center, session summaries, Git snapshots, and migration workflows

## StageOne Status

This repository now covers the `stageOne` runtime-facing Phase 0 baseline and has a concrete validation summary in `docs/architecture/stage-one-validation.md`.

The current codebase now covers the full Phase 0 desktop runtime path:

- workspace open and recent restore
- retrieval worker status
- health and logs
- preference controls
- approval shell entry UI
- startup recovery markers and recovery diagnostics
- migration detection, backup preparation, and upgrade diagnostics
- restore execution from the latest checkpoint payload
- cross-module event emission through the shared event bus
- checkpoint payload capture plus restore preview metadata
- design system with themes, components, and accessibility

Still worth improving after `stageOne` baseline completion:

- broader packaging and installer validation
- richer migration and restore semantics

## Tech Stack Note

This thin slice follows the `stageOne` technology direction, but currently lands only the subset already needed for Phase 0 runtime validation. The exact alignment and deferred stack items are tracked in `docs/architecture/tech-stack-alignment.md`.

## Project Structure

```
ai-digital-life/
├── apps/
│   └── desktop/              # Electron desktop application
│       ├── main/             # Main process
│       ├── preload/          # Preload script
│       ├── renderer/         # Renderer process
│       │   └── src/
│       │       ├── app/            # React 壳层：入口组合、Zustand store、文案与纯函数
│       │       ├── design-system/  # TypeScript design modules
│       │       ├── styles/         # CSS style system（含 workspace 阶段 UI）
│       │       └── locales/        # i18n resources
│       └── shared/           # Shared type definitions
├── packages/                 # Shared packages
│   ├── config/              # Configuration management
│   ├── errors/              # Error handling
│   ├── events/              # Event system
│   ├── kernel/              # Kernel module
│   ├── logger/              # Logging system
│   ├── migration/           # Migration system
│   ├── storage/             # Storage layer
│   ├── task/                # Task governance
│   └── workspace/           # Workspace management
├── workers/
│   └── health/              # Retrieval Worker
├── docs/
│   ├── architecture/        # Architecture documentation
│   └── design-system/       # Design system documentation
└── tests/
    ├── unit/                # Unit tests
    └── integration/         # Integration tests
```

## Commands

```bash
npm install
npm run build
npm run test
npm run start
```

### 本地开发（Vite + Electron）

开发模式下 Main 会加载 `http://localhost:5173`（见 `apps/desktop/main/index.ts`）。首次或 Main/Preload 变更后需先编译二者：

```bash
npm run build:main -w @ai-digital-life/desktop
npm run build:preload -w @ai-digital-life/desktop
```

然后开两个终端：

1. **渲染进程 / 内置浏览器预览**：`npm run dev -w @ai-digital-life/desktop`  
   - 在 Cursor/VS Code 的 **Simple Browser** 或系统浏览器打开 `http://localhost:5173` 即可预览 UI（无 Electron 时使用 `main.tsx` 内的 mock 桥接，功能受限但便于调样式）。
2. **外部桌面应用**：在 Vite 已启动的前提下执行 `npm run start -w @ai-digital-life/desktop` 启动 Electron 窗口（完整 IPC 与文件系统能力）。  
   - 若 Vite 提示端口被占用而改用其他端口（例如 `http://localhost:5174/`），请**先 `npm run build:main -w @ai-digital-life/desktop`** 再在同一 shell 设置环境变量后启动 Electron，例如 PowerShell：  
     `$env:ADL_RENDERER_DEV_URL='http://localhost:5174/'; npm run start -w @ai-digital-life/desktop`  
     （`ADL_RENDERER_DEV_URL` 由 `apps/desktop/main/index.ts` 读取，默认仍为 `http://localhost:5173`。）

`pnpm-workspace.yaml` is included because the target layout is still a `pnpm workspace`, but the scripts are also `npm workspace` compatible for environments where `pnpm` is not yet provisioned.

## Documentation

### Architecture

- [System Overview](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/system-overview.md)
- [Tech Stack Alignment](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/tech-stack-alignment.md)
- [Internationalization](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/internationalization.md)
- [Theming](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/theming.md)
- [Recovery and Migration](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/recovery-and-migration.md)
- [Task Governance](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/task-governance.md)
- [Workspace and Retrieval](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/workspace-and-retrieval.md)

### Design System

- [Design System Overview](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/README.md)
- [Tokens](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/tokens.md)
- [Themes](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/themes.md)
- [Components](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/components.md)
- [Accessibility](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/accessibility.md)
- [Responsive Design](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/responsive.md)
- [Testing Strategy](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/testing.md)
