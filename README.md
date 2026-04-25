# AI 数字生命

这是 `AI数字生命` 的规划与治理工作区，根目录以架构约束、阶段边界、协作规则和文档同步为主。

## 当前状态

- `ai-digital-life/` 是当前实际的 Phase 0 代码工作区
- `digitalLife/` 保留较早期的功能规格、阶段规划与实现笔记，其中部分子文档仍是 Electron 时代方案
- `.agents/` 维护项目级 Agent、skills、hooks 与 manifests
- `docs/development/` 维护开发协作与治理说明

## 实现工作区

`ai-digital-life/` 当前包含：

- `src-tauri/` Tauri 2.x Rust 入口、commands 与 capabilities
- `crates/` Cargo workspace 业务 crate
- `frontend/` React 19 + Vite + Zustand WebView 前端
- `tests/` Rust 集成测试与 E2E 目录
- `docs/architecture/` 与 `docs/design-system/` 实现文档

详细约束见 [AI Digital Life README](/E:/Programs/Obsidian/notes/ai-digital-life/README.md)。

## 技术方向

- Rust（stable）
- Tauri 2.x
- tokio + rusqlite + serde + tracing
- React 19 + Vite + Zustand
- Cargo workspace + 前端 `npm --prefix frontend`

实现工作区的技术对齐与阶段细节见：

- [Tech Stack Alignment](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/tech-stack-alignment.md)
- [Rust Migration Plan](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/rust-migration-plan.md)

## 开发协作

仓库已引入项目级 `AGENTS.md` 与 `.agents/` 体系，用于约束协作边界：

- 子Agent 分工
- 项目级 skills
- 分级治理 hooks
- 路由与文档收口规则

## 规划文档说明

- `digitalLife/` 继续保留产品愿景、阶段划分和早期设计讨论
- 当 `digitalLife/` 与 `ai-digital-life/` 或根目录治理文档冲突时，以当前 Rust + Tauri 文档为准
- 更新架构、规则、技术栈或目录结构时，优先同步根 `AGENTS.md`、`docs/development/*` 与 `ai-digital-life/docs/architecture/*`
