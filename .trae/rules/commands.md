---
description: Common commands quick reference, scripts entry points
alwaysApply: true
---

# 常用命令

## 开发命令（`ai-digital-life/`）

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动 Tauri 开发模式 |
| `npm run dev:browser` | 浏览器预览模式（用于快速开发和 Agent 测试） |
| `npm run dev:tauri` | Tauri 桌面应用 |
| `npm run dev:both` | 同时启动浏览器 + Tauri（推荐用于双端一致性验证） |
| `npm run build` | 构建所有包 |
| `npm run start` | 启动已构建应用 |

## 双端验证命令

| 命令 | 用途 |
|------|------|
| `npm run dev:both` | 同时启动两种模式，方便并排对比功能一致性 |

**推荐工作流：**
1. 开发阶段：先用 `npm run dev:browser` 在浏览器中快速迭代（方便 Agent 测试）
2. 验证阶段：用 `npm run dev:both` 同时验证两种模式的一致性

## 测试命令

| 命令 | 用途 |
|------|------|
| `npm test` | 单元测试（Vitest） |
| `npm run test:e2e` | E2E 测试（Playwright） |
| `npm run typecheck` | 类型检查 |
| `npx vitest run` | 直接运行 Vitest |

## 包管理

| 命令 | 用途 |
|------|------|
| `pnpm install` | 安装依赖 |
| `pnpm add <pkg> -w <ws>` | 添加依赖 |
| `pnpm list --depth 0` | 列出顶层依赖 |

## Rust 编译

| 命令 | 用途 | 说明 |
|------|------|------|
| `cargo check` | 编译检查（不生成二进制） | 快速验证代码正确性 |
| `cargo test --workspace` | 运行所有 Rust 测试 | 红绿测试用 |
| `cargo build` | 完整编译 | 首次或新增依赖时较慢 |

> ⚠️ **Rust 编译注意事项**：
> - 首次编译或新增依赖时，`cargo check` / `cargo build` 可能需要较长时间（下载依赖 + 编译）
> - 系统配置了 Clash 代理（`127.0.0.1:7890`），运行前需确保代理已开启，否则依赖下载会失败
> - Rust 工具链位于 `%USERPROFILE%\.cargo\bin\`，可能不在系统 PATH 中，需手动指定路径或设置环境变量

## 浏览器自动化

> 浏览器自动化工具选择、经验教训和快速参考已迁移至 [browser-automation.md](./browser-automation.md)

## 相关文件

- [ai-digital-life/package.json](/E:/Programs/Obsidian/notes/ai-digital-life/package.json)
- [ai-digital-life/vitest.config.ts](/E:/Programs/Obsidian/notes/ai-digital-life/vitest.config.ts)
- [browser-automation.md](./browser-automation.md)
- [browser-automation 技能](../skills/browser-automation/SKILL.md)
