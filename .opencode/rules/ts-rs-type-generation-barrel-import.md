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
4. **消费**：所有 bridge 实现层、IPC 接口层统一从 `'@ai-digital-life/kernel'` 导入类型，不直接引用 generated 文件

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
// TypeScript side - import from barrel, not generated file directly
import type { ModelResponse } from '@ai-digital-life/kernel';
```

## 错误示例

```typescript
// BAD: direct import from generated file
import type { ModelResponse } from '../shared/ipc/generated/ModelResponse';

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
