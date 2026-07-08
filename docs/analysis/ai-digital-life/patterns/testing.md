# 测试模式

> 源码路径：`ai-digital-life/`

## 测试层级

```
双层测试架构:
├── 前端: Vitest 3 + @testing-library/react + jsdom
├── Rust: cargo test（单元测试 + 集成测试）
└── E2E: Playwright（frontend/e2e/）
```

## 前端测试（Vitest）

### 配置

测试框架配置于 `frontend/vite.config.ts`（Vite 原生集成 Vitest）。

| 设置 | 值 |
|------|-----|
| 运行器 | Vitest 3 |
| 环境 | jsdom（DOM 模拟） |
| React 测试库 | `@testing-library/react` |
| 测试文件匹配 | `**/*.test.ts` / `**/*.test.tsx` |

### 测试命令

```bash
# 运行所有前端测试
pnpm --dir frontend run test

# Watch 模式
pnpm --dir frontend run test:watch

# 覆盖率
pnpm --dir frontend run coverage

# E2E 测试
pnpm --dir frontend run test:e2e
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
| E2E 测试 | `*.spec.ts` | `frontend/e2e/` |

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

## E2E 测试（Playwright）

### 配置

E2E 测试在 `frontend/e2e/` 目录，使用 Playwright。

| 设置 | 值 |
|------|-----|
| 框架 | Playwright |
| 测试文件 | `frontend/e2e/*.spec.ts` |
| 运行命令 | `pnpm run test:e2e` |

```typescript
// frontend/e2e/basic-ui.spec.ts
import { test, expect } from '@playwright/test';

test('should display the app', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await expect(page.locator('text=AI Digital Life')).toBeVisible();
});
```

## 结束验收流程

任何代码变更完成后，必须按以下流程自动验证：

```
步骤 1（并行）:
├── 前端: lint:fix → format → typecheck
└── Rust:  cargo fmt → cargo clippy → cargo check

步骤 2（并行）:
├── 前端: vitest run
└── Rust:  cargo test --workspace
```

过程规则：
- ESLint/Prettier/Clippy/rustfmt 先自动修复，再验证
- 修复后若产生代码变更，重新执行类型检查
- 测试失败的区分"实现 bug"与"测试过时"
- 3 次修复仍失败则向用户报告

## 文件参考

| 路径 | 职责 |
|------|------|
| `frontend/vite.config.ts` | Vite + Vitest 配置 |
| `frontend/package.json` | 测试命令定义（test/test:watch/coverage/test:e2e） |
| `frontend/src/mock-bridge.ts` | 前端测试 mock 桥接（纯内存模拟） |
| `frontend/src/shared/__tests__/` | 共享模块测试 |
| `frontend/src/app/**/*.test.ts` | 前端组件/工具测试 |
| `frontend/e2e/` | Playwright E2E 测试 |
| `crates/*/tests/` | Rust 集成测试 |
| `Cargo.toml` | Rust 工作区配置 |
