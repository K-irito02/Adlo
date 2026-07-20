---
description: 前端 Bridge 接口三实现架构（Tauri/Preview/Mock）
globs: ai-digital-life/frontend/src/shared/ipc/**,ai-digital-life/frontend/src/tauri-bridge/**,ai-digital-life/frontend/src/preview-bridge/**,ai-digital-life/frontend/src/mock/**
alwaysApply: false
---

# Bridge 接口三实现模式

## 规则描述

所有面向 Tauri 桌面应用的能力必须通过统一的 `DigitalLifeBridge` 接口抽象，并严格提供三套独立实现：`Tauri`、`Preview` 和 `Mock`。接口定义在前端 IPC 共享层，不绑定任何运行时。

## 三实现架构

| 实现 | 文件 | 激活条件 | 行为 |
|------|------|----------|------|
| **Tauri** | `tauri-bridge/index.ts` → `createTauriBridge()` | Tauri 桌面运行时 | 通过 `@tauri-apps/api/core.invoke()` 调用 Rust 命令 |
| **Preview** | `preview-bridge/index.ts` → `setupPreviewBridge()` | 浏览器预览模式 | 混合 mock + 真实预览实现（PTY/文件操作等） |
| **Mock** | `mock-bridge.ts` → `mockDigitalLifeBridge` | 纯前端开发/测试 | 全内存 mock，无后端依赖 |

## 分层架构

1. **接口层** (`shared/ipc/`): 按领域拆分，`digital-life.ts` 汇总为 `DigitalLifeBridge`
2. **子接口** (`shared/ipc/workspace.ts`, `shared/ipc/agent.ts` 等): 每个 IPC 域有独立接口文件
3. **Tauri 实现** (`tauri-bridge/tauri-*.ts`): 每个子接口一个实现文件，`tauri-bridge/index.ts` 组装
4. **Mock 实现** (`mock/mock-*.ts`): 每个子接口一个 mock 文件，`mock-bridge.ts` 组装
5. **Preview 实现** (`preview-bridge/preview-*.ts`): 覆盖需要真实行为的部分，其余委派给 mock

## 正确示例

```typescript
// Interface definition
// shared/ipc/my-feature.ts
export interface MyFeatureBridge {
  doSomething(input: string): Promise<IpcResult<ResultType>>;
}

// Tauri implementation
// tauri-bridge/tauri-my-feature.ts
export function createTauriMyFeatureBridge(): MyFeatureBridge {
  return {
    doSomething: (input) => invokeIpc<ResultType>('my_feature_do_something', { input }),
  };
}

// Mock implementation
// mock/mock-my-feature.ts
export const mockMyFeature: MyFeatureBridge = {
  doSomething: async (input) => ({ ok: true, data: { result: `mocked ${input}` } }),
};
```

## 错误示例

```typescript
// BAD: calling Tauri invoke directly in UI code
import { invoke } from '@tauri-apps/api/core';
function handleClick() {
  const result = await invoke('workspace_open', { workspacePath });
}

// BAD: only implementing for Tauri, breaking browser mode
if (isTauri) { /* has code */ } else { /* nothing */ }
```

## 适用场景

- 所有 Tauri Command 调用的前端封装
- 新增 IPC 能力时必须三端同步实现
- UI 组件只能通过 `window.digitalLife` 或依赖注入访问能力，不直接调用 invoke
