---
description: Rust→TypeScript 自动类型生成及 kernel 桶导入规范
globs: ai-digital-life/crates/**/*.rs,ai-digital-life/frontend/src/kernel/**
alwaysApply: false
---

# ts-rs Rust→TypeScript 自动类型生成与 kernel 桶导入模式

## 规则描述

所有跨 IPC 边界的 Rust 数据类型必须使用 `ts-rs` 自动生成对应的 TypeScript 类型定义，并通过 `@ai-digital-life/kernel` 桶（barrel）模块统一 re-export。杜绝手写重复类型定义，确保 Rust 与 TypeScript 两端类型定义完全一致。

## 实现机制

1. **Rust 端**：在 struct/enum 上添加 `#[derive(TS)]` 和 `#[ts(export, export_to = "...")]` 属性，触发 ts-rs 在编译时生成 `.ts` 文件
2. **生成物**：写入 `frontend/src/shared/ipc/generated/`（每个类型独立文件，ts-rs v10 按 export_to 路径生成）
3. **桶导入**：`frontend/src/kernel/index.ts` 通过 `export *` 将所有子模块汇聚为单一包入口 `@ai-digital-life/kernel`
4. **消费**：bridge 实现层、IPC 接口层统一从 `'@ai-digital-life/kernel'` 导入类型，不直接引用 generated 文件
5. **UI 层例外（重要）**：`src/app/**` 属于 UI 层，**禁止**从 `@ai-digital-life/kernel`（含其子路径）导入，**即使 type-only 也禁止** —— 由 ESLint `no-restricted-imports`（`frontend/eslint.config.js`，`allowTypeImports: false`）强制。UI 层需用 kernel 派生类型时，**必须在 `frontend/src/shared/ipc/` 增加 re-export**，再从 `@shared/ipc` 消费

## 层与导入来源对照

| 层 | 路径 | kernel 派生类型的导入来源 |
|----|------|--------------------------|
| bridge / IPC / mock / preview | `src/tauri-bridge/**`、`src/mock/**`、`src/preview-bridge/**`、`src/httpBridge*`、`src/shared/**` | `@ai-digital-life/kernel`（直接） |
| store / regions / utils / hooks / App | `src/app/stores/**`、`src/app/regions/**`、`src/app/utils/**`、`src/app/hooks/**`、`src/app/App.tsx` | `@shared/ipc`（经 re-export） |
| 其余 UI 组件 | `src/app/**`（含 `components/`、`features/`） | `@shared/ipc`（经 re-export） |

> `src/shared/**` 自身直接引用 kernel 是合法且惯用的（`src/shared/ipc/*.ts` 已有 12+ 处）；`src/shared/ipc/` 同时承担「向 UI 层转出」的角色。

## 正确示例

```rust
// Rust side - add TS derive + export path
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../frontend/src/shared/ipc/generated/")]
pub struct ModelResponse {
    pub provider_id: String,
    pub model_id: String,
    pub content: String,
}
```

```typescript
// bridge / IPC 层 —— 直接引用 barrel
import type { ModelResponse } from '@ai-digital-life/kernel';
```

```typescript
// shared/ipc/index.ts —— 为 UI 层补一条 re-export（UI 层无法直接引用 kernel 时的处方）
export type { IpcError, IpcResult } from '@ai-digital-life/kernel';
export { toUserMessage } from '@ai-digital-life/kernel';
```

```typescript
// UI 层（src/app/**）—— 从 @shared/ipc 消费
import type { IpcError } from '@shared/ipc';
```

## 错误示例

```typescript
// BAD: direct import from generated file
import type { ModelResponse } from '../shared/ipc/generated/ModelResponse';

// BAD: UI 层直接引用 kernel（含 type-only）—— lint 报错
import type { IpcError } from '@ai-digital-life/kernel';
import type { IpcResult } from '@ai-digital-life/kernel';

// BAD: UI 层为绕开 lint 就地手写结构等价的复本（第二份契约面，会随 kernel 演进漂移）
interface NormalizedIpcError {
  code: string;
  message: string;
}

// BAD: hand-written duplicate type that drifts from Rust
interface ModelResponse {
  providerId: string;
  modelId: string;
  content: string;
}
```

## 适用场景

- 所有跨 Tauri IPC Command 的参数和返回值类型
- Tauri 事件 payload 类型
- 需要在前端消费的 Rust 后端数据结构
- Session、Workspace、Config、Agent 等核心领域模型的类型定义
- UI 层需要 kernel 派生类型（如 `IpcError`）时，先在 `src/shared/ipc/` 补 re-export 再消费

## 相关文件

- `frontend/eslint.config.js` — UI 层 `no-restricted-imports` 规则真源
- `frontend/src/kernel/index.ts` / `frontend/src/kernel/errors.ts` — `IpcResult` / `IpcError` / `toUserMessage` 定义处
- `frontend/src/shared/ipc/index.ts` — 面向 UI 层的 re-export 出口
