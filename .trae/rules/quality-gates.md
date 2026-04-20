---
description: Tests, typecheck, migration, and pre-merge quality gates
globs: ai-digital-life/tests/**,ai-digital-life/vitest.config.ts
alwaysApply: false
---

# 质量门禁

## 合并前必检项

| 检查项 | 命令 | 执行目录 |
|--------|------|----------|
| 单元测试 | `npm test` | `ai-digital-life/` |
| 类型检查 | `npm run typecheck` | `ai-digital-life/` |
| 桌面类型检查 | `npm run typecheck -w @ai-digital-life/desktop` | `ai-digital-life/` |

## 高风险改动必检项

以下改动类型**必须**附带相关测试：

| 改动类型 | 必须覆盖的测试 |
|----------|----------------|
| IPC 通道 | `tests/integration/renderer-shell.test.ts` |
| 存储迁移 | `tests/unit/storage/` 或 `tests/unit/migration/` |
| `kernel` 契约 | 相关包单元测试 |
| `applyPatch` 路径 | `tests/unit/change-engine/` |
| UI 组件 | `tests/unit/components/` |
| React Hook | `tests/unit/components/` 或 `tests/unit/hooks/` |
| CSS 样式变更 | 类型检查 + 视觉验证 |

## UI/功能变更红绿测试规则

**任何 UI/UX 或功能变更完成后，必须执行全量红绿测试，不得跳过。**

### 必须执行的测试

| 步骤 | 命令 | 说明 |
|------|------|------|
| 1. 类型检查 | `npm run typecheck -w @ai-digital-life/desktop` | 确保零类型错误 |
| 2. 单元测试 | `npx vitest run` | 确保所有测试通过 |
| 3. 受影响组件测试 | `npx vitest run tests/unit/components/` | 确保组件测试通过 |

### 适用范围

- 新增 UI 组件
- 修改现有组件的 props、状态或行为
- CSS 样式变更（尤其是主题相关）
- Hook 逻辑变更
- 组件迁移（如原生 → 自定义组件）

### 禁止行为

- ❌ 跳过测试直接提交
- ❌ 只运行部分测试忽略失败
- ❌ 类型检查有错误仍标记任务完成

## SQLite / Storage 规则

- Schema 变更：**必须**带迁移脚本
- 禁止仅改运行时字符串而不改版本与迁移注册
- 迁移脚本位置：`packages/migration/`

## Renderer 集成测试

- 工作区壳与关键 IPC：`tests/integration/renderer-shell.test.ts`
- 桥接 API 变更时同步 mock：`renderer/src/mock-bridge.ts`

## 测试目录结构

```
tests/
├── unit/           # 单元测试（与包对应）
└── integration/    # 集成测试
```

## 随项目演进

- 测试命令变更：更新合并前必检项表格
- 新增高风险改动类型：更新高风险改动必检项表格
- 测试目录结构调整：更新测试目录结构图

## 相关文件

- [ai-digital-life/vitest.config.ts](/E:/Programs/Obsidian/notes/ai-digital-life/vitest.config.ts)
- [ai-digital-life/package.json](/E:/Programs/Obsidian/notes/ai-digital-life/package.json)
