---
description: 前端 Bridge 接口四端实现架构（Tauri/Preview/HTTP/Mock）
globs: adlo/frontend/src/shared/ipc/**,adlo/frontend/src/tauri-bridge/**,adlo/frontend/src/preview-bridge/**,adlo/frontend/src/mock/**,adlo/frontend/src/httpBridge.ts
alwaysApply: false
---

# Bridge 接口四端实现模式

现行实现为**四端**：Tauri（invoke）、Preview（浏览器，http 优先可回退）、HTTP（`httpBridge.ts`，ad-server 基底实现，tauri 经 `...http` 继承）、Mock（纯内存）。

## 规则描述

所有面向 Tauri 桌面应用的能力必须通过统一的 `DigitalLifeBridge` 接口抽象，并严格提供四套独立实现：`Tauri`、`Preview`、`HTTP` 和 `Mock`。接口定义在前端 IPC 共享层，不绑定任何运行时。分层全景见 [adding-an-ipc-domain.md](../../docs/development/adding-an-ipc-domain.md)（四端清单）。

## 四实现架构

| 实现 | 文件 | 激活条件 | 行为 |
|------|------|----------|------|
| **Tauri** | `tauri-bridge/index.ts` → `createTauriBridge()` | Tauri 桌面运行时 | 通过 `@tauri-apps/api/core.invoke()` 调用 Rust 命令（系统域）；业务域经 `...http`（`createHttpBridge`）继承 |
| **Preview** | `preview-bridge/index.ts` → `setupPreviewBridge()` | 浏览器预览模式 | http 优先、可回退 mock + 真实预览实现（PTY/文件操作等） |
| **HTTP** | `httpBridge.ts` → `createHttpBridge()` | 任意环境（ad-server 基底实现） | 全部业务域 1:1 映射 `crates/server/src/router.rs` 的 `IpcResult` 包络路由（fetch）；系统域无路由（类型化回退） |
| **Mock** | `mock-bridge.ts` → `mockDigitalLifeBridge` | 纯前端开发/测试 | 全内存 mock，无后端依赖 |

## 分层架构

1. **接口层** (`shared/ipc/`): 按领域拆分，`digital-life.ts` 汇总为 `DigitalLifeBridge`
2. **子接口** (`shared/ipc/workspace.ts`, `shared/ipc/agent.ts` 等): 每个 IPC 域有独立接口文件
3. **Tauri 实现** (`tauri-bridge/tauri-*.ts`): 每个子接口一个实现文件，`tauri-bridge/index.ts` 组装；系统域调用 `invoke()`，业务域经 `...http` 继承
4. **Mock 实现** (`mock/mock-*.ts`): 每个子接口一个 mock 文件，`mock-bridge.ts` 组装
5. **Preview 实现** (`preview-bridge/preview-*.ts`): 覆盖需要真实行为的部分（spread 自 http），其余委派给 mock 回退
6. **HTTP 实现** (`httpBridge.ts`): 业务域 1:1 映射 ad-server 路由；Tauri/Preview 均以它为基底继承

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

HTTP 端不是按域单独工厂，而是 `httpBridge.ts` 的单一 `createHttpBridge()` 入口：所有业务域 1:1 映射 ad-server 路由（实现清单见 [adding-an-ipc-domain.md](../../docs/development/adding-an-ipc-domain.md)「四端实现」），新增域时在 `createHttpBridge` 内补该域的 fetch 实现，无需新建文件。

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
- 新增 IPC 能力时必须四端同步实现（Tauri / Preview / HTTP / Mock）
- UI 组件只能通过 `window.digitalLife` 或依赖注入访问能力，不直接调用 invoke
## 同步返回方法（非 `Promise<IpcResult<T>>`）

桥接接口中少数方法是**同步**返回的（例如纯 URL 构造器 `clipboard.getThumbUrl` / `clipboard.getImageUrl`、`workspace.onFileChanged` 的取消订阅函数）。它们与异步方法的四端实现规则不同：

| 端 | 实现要求 |
|----|---------|
| `shared/ipc/*.ts` 接口 | 显式声明返回类型（如 `(thumbPath: string) => string`），并在 JSDoc 标注「同步返回，不发起网络请求」 |
| `httpBridge.ts` | 常规实现（纯字符串/回调构造，无副作用） |
| `tauri-bridge/index.ts` | 经 `...http`（`createHttpBridge`）继承，**无需单独实现**；`@see` 注释应写明"`...http` 继承"而非指向不存在的成员 |
| `preview-bridge/index.ts` | **必须在 spread 之后显式 override 为 `http.<domain>.<method>`**。不能放进 `preferHttpWhenReachable` 的 `syncReturnMethods`（那是 fallback-first：会返回 mock 的桩值），否则预览模式下静默拿到空值（如 URL 恒为 `''`，图片渲染成占位图标） |
| `mock/*` | 返回空实现/桩值（`''`、`() => {}`） |

> 新增同步方法时，若忘记 preview-bridge 的 override，类型检查与测试都不会报错 —— 必须在 Code Review 中按名核对。

## 桌面壳独有域（`supported` 回落）

少数域只在桌面壳存在，浏览器环境没有等价系统能力（先例：`mediaSession` 系统媒体卡片）。它们仍必须四端接线，但用**能力标志 + 回落**表达差异，而不是在 UI 里判 `isTauri`：

| 端 | 实现要求 |
|----|---------|
| `shared/ipc/*.ts` | 接口声明 `readonly supported: boolean`；文档写明不支持端的回落路径（如 `navigator.mediaSession`） |
| `tauri-bridge` | `supported: true` + 真实 invoke / 事件订阅 |
| `httpBridge` / `mock` / `preview-bridge` | `supported: false` + no-op（事件订阅返回同步 unsubscribe） |
| 消费端 | 只在 `supported === true` 时走壳层实现；否则回落到 Web 标准能力，**不得依赖 `isTauriShell()` 分叉** |

事件类壳层能力（如 `digital-life://browser-media-state`）同样要在不支持端显式 no-op；漏了会让浏览器模式订阅到不存在的通道或静默丢事件。
