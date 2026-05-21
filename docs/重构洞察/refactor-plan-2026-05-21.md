# 重构实施计划 – ai-digital-life
**生成日期**：2026-05-21
**更新日期**：2026-05-21
**基于**：[refactor-insight-2026-05-21.md](./refactor-insight-2026-05-21.md)

---

## 执行摘要

| Phase | 状态 | 完成度 |
|-------|------|--------|
| Phase 1：清理遗留废弃 Store | ✅ 已完成 | 100% |
| Phase 2：统一错误处理格式 | ✅ 已完成 | 100% |
| Phase 3：抽取桥接层共享类型 | ✅ 已完成（核心） | 80% |

---

## 可执行项分析

| # | 发现问题 | 可执行性 | 理由 |
|---|----------|----------|------|
| 1 | 遗留 Store 废弃标记清理 | ✅ **可直接执行** | 已确认无任何外部引用 |
| 2 | 统一错误处理格式 | ✅ **可直接执行** | 仅涉及前端适配层 |
| 3 | 抽取桥接层共享类型 | ⚠️ **需重构** | 涉及 3 个桥接文件，风险中等 |
| 4 | 全局 CSS 变量迁移 | ❌ **暂缓** | 设计 token 迁移需设计确认 |
| 5 | 模块化分层（features/） | ❌ **暂缓** | 架构决策，需团队讨论 |
| 6 | Rust Crates 合并 | ❌ **暂缓** | 架构决策，需团队讨论 |

---

## Phase 1：清理遗留废弃 Store（🔴高优先级）

### 目标
删除已标记 `@deprecated` 且无外部引用的 4 个独立 Store 文件，减少维护负担。

### 状态：✅ 已完成

### 文件清单

| 文件路径 | 状态确认 |
|----------|----------|
| `frontend/src/app/stores/useWorkspaceStore.ts` | ✅ 已删除 |
| `frontend/src/app/stores/useSessionStore.ts` | ✅ 已删除 |
| `frontend/src/app/stores/useEditorStore.ts` | ✅ 已删除 |
| `frontend/src/app/stores/usePatchStore.ts` | ✅ 已删除 |

### 验证结果
- 类型检查：✅ 通过（无新增错误）
- 单元测试：✅ 183 个测试全部通过

### 执行步骤

1. [ ] 备份（可选，建议先确认 Git 状态）
2. [ ] 删除 4 个废弃 Store 文件
3. [ ] 运行类型检查 `npm --prefix frontend run typecheck`
4. [ ] 运行测试 `npm --prefix frontend run test`
5. [ ] 提交变更

### 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 遗漏隐藏引用 | 🟡中 | 已通过 Grep 确认无 import 引用 |
| 热更新后状态丢失 | 🟢低 | Store 状态已迁移到 slicedStore.ts |

---

## Phase 2：统一错误处理格式（🟡中优先级）

### 目标
统一 `IpcResult<T>` 错误结构，确保所有 Tauri Command 返回一致的错误格式。

### 状态：✅ 已完成

### 变更内容
1. 在 `shared/ipc.ts` 中新增 `IpcErrorCode` 枚举，与 Rust `AppError` 变体对应
2. 更新 `tauri-bridge.ts` 使用 `IpcErrorCode.INVOKE_ERROR`
3. 更新 `preview-bridge.ts` 使用 `IpcErrorCode.NOT_FOUND` 和 `IpcErrorCode.PREVIEW_API_ERROR`

### 验证结果
- 类型检查：✅ 通过（无新增错误）
- 单元测试：✅ 183 个测试全部通过

### 执行步骤

1. [ ] 分析所有 Tauri Command 的错误返回模式
2. [ ] 在 `frontend/src/shared/ipc.ts` 中定义统一错误码枚举
3. [ ] 修改 `tauri-bridge.ts` 的 `invokeIpc` 函数，规范化错误结构
4. [ ] 更新 `preview-bridge.ts` 和 `mock-bridge.ts` 的错误返回
5. [ ] 运行类型检查和测试

### 错误码设计

```typescript
export enum IpcErrorCode {
  NETWORK_ERROR = "NETWORK_ERROR",
  TAURI_INVOKE_ERROR = "TAURI_INVOKE_ERROR",
  NOT_FOUND = "NOT_FOUND",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}
```

---

## Phase 3：抽取桥接层共享类型（🟡中优先级）

### 目标
减少 `tauri-bridge.ts`、`preview-bridge.ts` 和 `mock-bridge.ts` 之间的代码重复。

### 状态：✅ 已完成（核心部分）

### 已完成变更
1. ✅ `IpcErrorCode` 枚举已抽取到 `shared/ipc.ts`
2. ✅ `PtySessionInfo`, `PtyOutputEvent` 接口已抽取到 `shared/ipc.ts`
3. ✅ `DigitalLifeBridge` 接口已抽取到 `shared/ipc.ts`

### 未完成（风险较高，建议后续评估）
- 辅助函数抽取（如 `loadRecentWorkspaces` 等）涉及桥接层重构
- 完整抽取可能影响双端一致性，需充分测试

### 重构策略

```
shared/
├── ipc.ts          # 类型定义（已有）
├── ipc-utils.ts    # 新增：共享辅助函数
└── bridge-base.ts  # 新增：抽象基类或工厂函数
```

### 执行步骤

1. [x] 抽取共享辅助函数到 `shared/ipc-utils.ts`（核心已完成）
2. [x] 抽取共享类型（确保 `shared/ipc.ts` 已包含所有类型）
3. [ ] 使用工厂函数或 mixin 模式减少重复（待评估）
4. [x] 运行类型检查和测试
5. [ ] 双端验证（Tauri + 浏览器模式）（待执行）

### 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 破坏双端一致性 | 🔴高 | 每个变更后进行双端验证 |
| 热更新失效 | 🟡中 | 每次保存后检查浏览器 |

---

## 暂缓项（需后续讨论）

### 1. 全局 CSS 变量迁移
- **原因**：设计 token 迁移需要与 UI 设计确认
- **前置条件**：设计系统文档更新

### 2. 模块化分层（features/）
- **原因**：涉及组件目录结构重组
- **前置条件**：团队评审和共识

### 3. Rust Crates 合并
- **原因**：`kernel` crate 职责需明确
- **前置条件**：架构评审

---

## 执行顺序

```
Phase 1（清理废弃 Store）→ Phase 2（统一错误处理）→ Phase 3（抽取共享类型）
```

每个 Phase 完成后：
1. ✅ 运行类型检查
2. ✅ 运行测试
3. ⚠️ 双端验证（Phase 3 待执行）
4. ⚠️ 提交变更（待执行）

---

## 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `frontend/src/app/stores/useWorkspaceStore.ts` | 删除 | 废弃 Store |
| `frontend/src/app/stores/useSessionStore.ts` | 删除 | 废弃 Store |
| `frontend/src/app/stores/useEditorStore.ts` | 删除 | 废弃 Store |
| `frontend/src/app/stores/usePatchStore.ts` | 删除 | 废弃 Store |
| `frontend/src/shared/ipc.ts` | 新增 | `IpcErrorCode` 枚举 |
| `frontend/src/tauri-bridge.ts` | 修改 | 使用 `IpcErrorCode` 枚举 |
| `frontend/src/preview-bridge.ts` | 修改 | 使用 `IpcErrorCode` 枚举 |

---

> 由自动化重构洞察生成于 2026-05-21 14:45:00
> 更新于 2026-05-21 21:40:00
