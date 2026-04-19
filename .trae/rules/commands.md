---
description: Common commands quick reference, scripts entry points
alwaysApply: true
---

# 常用命令速查

## 开发命令（在 `ai-digital-life/` 执行）

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动桌面应用开发模式 |
| `npm run build` | 构建所有包 |
| `npm run start` | 启动已构建的桌面应用 |
| `npm test` | 运行单元测试 |
| `npm run typecheck` | 类型检查所有包 |
| `npm run test:e2e` | 运行 E2E 测试 |

## 单包命令

| 命令 | 用途 |
|------|------|
| `npm run build -w @ai-digital-life/desktop` | 仅构建桌面应用 |
| `npm run typecheck -w @ai-digital-life/desktop` | 仅检查桌面应用类型 |
| `npm run dev -w @ai-digital-life/desktop` | 启动桌面应用开发模式 |

## 测试命令

| 命令 | 用途 |
|------|------|
| `vitest run` | 运行所有测试 |
| `vitest run tests/unit/` | 运行单元测试 |
| `vitest run tests/integration/` | 运行集成测试 |
| `vitest watch` | 监听模式运行测试 |
| `playwright test` | 运行 E2E 测试 |

## 包管理

| 命令 | 用途 |
|------|------|
| `pnpm install` | 安装依赖 |
| `pnpm add <package> -w <workspace>` | 添加依赖到指定包 |
| `pnpm list --depth 0` | 列出顶层依赖 |

## 随项目演进

- 新增 npm 脚本：更新开发命令表格
- 新增测试命令：更新测试命令表格
- 包管理命令变化：更新包管理表格

## 相关文件

- [ai-digital-life/package.json](/E:/Programs/Obsidian/notes/ai-digital-life/package.json)
- [ai-digital-life/vitest.config.ts](/E:/Programs/Obsidian/notes/ai-digital-life/vitest.config.ts)
