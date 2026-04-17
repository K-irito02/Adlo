# digitalLife

AI数字生命项目 - 现代化AI编程软件实现规划

## 项目概述

本项目旨在构建一个真正的"AI数字生命"——一个能够自动操作电脑上任何内容的智能体。

### 当前阶段

目前聚焦于现代化AI编程能力的实现，这是AI数字生命的基石：
- AI编程助手（MVP）
- 文件管理能力
- 浏览器操作能力
- 应用控制能力
- 完整AI数字生命

## 目录结构

- `digitalLife/aiFunction/expectedFunctionality/` - 功能规格文档
- `digitalLife/aiFunction-Implementation/stageOne/` - 第一阶段实现规划与技术基线
- `ai-digital-life/` - 当前 Phase 0 可运行薄切片代码仓
- `.agents/` - 项目级开发 Agent、skills、hooks 与 manifests
- `docs/development/` - 开发协作体系说明文档

## 技术栈

- TypeScript 5.3+
- Electron 28+
- Vite + electron-builder
- Zustand (状态管理)
- Bun、pnpm (包管理)

当前 `ai-digital-life/` 代码目录使用的是对上述技术栈的 Phase 0 子集实现。具体对齐情况见：

- [Tech Stack Alignment](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/tech-stack-alignment.md)

## 开发协作体系

仓库根已引入项目级 `AGENTS.md` 与 `.agents/` 体系，用于约束 `AI数字生命` 项目的开发协作：

- 子Agent 分工
- 项目级 skills
- 分级治理 hooks
- 路由与文档收口规则
