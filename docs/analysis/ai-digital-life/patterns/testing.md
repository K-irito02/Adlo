# 测试模式

> 源码路径：`ai-digital-life/`

## 测试层级

```
双层测试架构:
├── 前端: Vitest 3 + @testing-library/react + jsdom（独立 vitest.config.ts）
└── Rust: cargo test（单元测试 + 集成测试，共享 common/mod.rs helpers）
```

## 前端测试（Vitest）

### 配置

测试框架配置于 `frontend/vitest.config.ts`（独立配置，不合并 vite.config.ts）。

| 设置 | 值 |
|------|-----|
| 运行器 | Vitest 3 |
| 池模式 | forks（每 worker 独立 jsdom 环境） |
| 环境 | jsdom（DOM 模拟） |
| React 测试库 | `@testing-library/react` |
| 测试文件匹配 | `**/*.test.ts` / `**/*.test.tsx` |
| Coverage | `@vitest/coverage-v8`（lcov + text，无门禁） |

### 测试命令

```bash
# 运行所有前端测试
pnpm --dir frontend run test

# Watch 模式
pnpm --dir frontend run test:watch

# 覆盖率
pnpm --dir frontend run coverage

# 受影响测试优先（开发时推荐）
pnpm --dir frontend run test -- src/app/features/browser
pnpm --dir frontend run test -- --reporter=verbose
```

### Mock 策略（mock-bridge）

**关键原则**：不 mock IPC 调用，而是使用 `mock-bridge.ts` 替换整个桥接层。

```
真实模式: 组件 → useAppStore → tauri-bridge.invoke() → Rust 后端
Mock 模式: 组件 → useAppStore → mock-bridge.ts → 纯内存模拟
```

```typescript
// mock-bridge.ts — 纯内存模拟
const mockWorkspace: WorkspaceBridge = {
  listWorkspaces: async () => ({ ok: true, data: [{ id: '1', name: 'test' }] }),
  renameFile: async (path, name) => ({ ok: true, data: { path: name } }),
  // ... 所有方法返回 IpcResult<T>
};
```

- mock-bridge 实现 `shared/ipc/` 中定义的全部接口
- 返回类型统一为 `IpcResult<T>`，与真实桥接一致
- mock 数据基于真实类型定义生成，覆盖常规路径 + 边界路径

### 测试文件命名约定

| 测试类型 | 命名模式 | 位置 |
|----------|----------|------|
| 单元测试 | `{module}.test.ts` | 与被测文件同目录 |
| 单元测试 | `__tests__/{module}.test.ts` | `__tests__/` 子目录 |
| 组件测试 | `{Component}.test.tsx` | 与被测组件同目录 |

### 测试用例设计

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

describe('useSomeHook', () => {
  beforeEach(() => {
    // 重置 mock 状态
  });

  it('should return default value', () => {
    // 常规路径
  });

  it('should handle empty input', () => {
    // 边界路径
  });

  it('should handle error response', () => {
    // 异常路径
  });
});
```

### 测试材料生成规则

生成测试数据时：
- 使用代码中实际的 TS 类型生成数据
- 覆盖常规路径（正常业务逻辑）
- 覆盖边界路径（空值、异常值、极值）
- 模拟真实操作流和数据流
- 禁止裁剪数据字段来简化逻辑

### 前端覆盖率

```bash
pnpm --dir frontend run coverage
```

- 工具：`@vitest/coverage-v8`
- 输出格式：lcov + text
- **不设硬性门禁**，仅作参考

## Rust 测试（cargo test）

### 测试类型

| 类型 | 位置 | 说明 |
|------|------|------|
| 单元测试 | `crates/*/src/**/*.rs`（`#[cfg(test)]` 模块） | 内联在源文件中 |
| 集成测试 | `crates/*/tests/` | 独立测试文件，测试公开 API |

### 测试命令

```powershell
# 设置 PATH（必须）
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

# 运行所有 Rust 测试
cargo test --workspace

# 运行单个 crate 测试
cargo test -p <crate-name>

# 运行特定测试
cargo test --workspace <test-name>

# 编译检查（无二进制输出）
cargo check --workspace
```

### Rust 测试示例

```rust
// 单元测试（在源文件末尾）
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_list() {
        let storage = Storage::new(":memory:").unwrap();
        let result = storage.list_workspaces().unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_error_handling() {
        let result = some_function_that_fails();
        assert!(matches!(result, Err(AppError::NotFoundError(_))));
    }
}
```

```rust
// 集成测试（crates/my-crate/tests/integration_test.rs）
use my_crate::PublicApi;

#[test]
fn test_integration_flow() {
    let api = PublicApi::new();
    let result = api.do_something();
    assert!(result.is_ok());
}
```

### Rust 代码质量命令

```powershell
# rustfmt 格式化
cargo fmt --all

# Clippy lint
cargo clippy --workspace --all-targets --fix -- -D warnings

# 编译检查
cargo check --workspace

# Rust 覆盖率
cargo llvm-cov --workspace
```

### Rust 覆盖率

```bash
cargo llvm-cov --workspace
```

- 工具：`cargo-llvm-cov`
- 输出格式：lcov + html
- **不设硬性门禁**，仅作参考

## Rust 集成测试

### 测试结构

集成测试位于 `crates/server/tests/`，通过共享 `common/mod.rs` 模块复用 helper：

| 文件 | 测试数 | 说明 |
|------|--------|------|
| `workspace_all.rs` | 17 | 工作区生命周期 + 侧边栏 |
| `workspace_git_all.rs` | 19 | Git 操作 + 可视化 |
| `ci_durable.rs` | 12 | CI Token + 持久会话 |
| `reference_retrieval.rs` | 7 | 引用管理 + 检索 |
| `engine_health.rs` | 3 | 初始化 + 健康检查 |
| `patch.rs` | 6 | 补丁集 CRUD |
| `snapshot.rs` | 1 (4 ignored) | 快照管理 |
| `pty_ws.rs` | 3 (2 ignored) | PTY WebSocket |
| `binary_smoke.rs` | 1 | 二进制烟测 |

### 受影响测试优先执行

```powershell
# 仅指定 crate
cargo test -p adl-server

# 仅指定集成测试文件
cargo test -p adl-server --test workspace_all

# 模糊匹配测试名称
cargo test reference_list
```

## 文件参考

| 路径 | 职责 |
|------|------|
| `frontend/vitest.config.ts` | Vitest 配置（独立，不合并 vite.config.ts） |
| `frontend/src/test-setup.ts` | 全局测试 setup（polyfills + cleanup） |
| `frontend/package.json` | 测试命令定义（test/test:watch/coverage） |
| `frontend/src/mock/` | 前端测试 mock 模块（mock-bridge 模式） |
| `frontend/src/app/**/*.test.ts` | 前端组件/工具测试 |
| `crates/server/tests/common/mod.rs` | Rust 集成测试共享 helpers |
| `crates/server/tests/*.rs` | Rust 集成测试 |
| `Cargo.toml` | Rust 工作区配置 |
