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

## 相关文件

- [ai-digital-life/package.json](/E:/Programs/Obsidian/notes/ai-digital-life/package.json)
- [ai-digital-life/vitest.config.ts](/E:/Programs/Obsidian/notes/ai-digital-life/vitest.config.ts)
