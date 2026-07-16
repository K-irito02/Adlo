# Phase E: Quick Wins 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复重构洞察报告中 7 个 Medium 级快速修复项（M1-M7），消除空 catch 块、文档漂移、魔术数字、字段重复、命名不一致、嵌套过深等代码质量问题。

**Architecture:** 每个修复都是独立的、小范围的改动（1-50 行），不改变现有功能行为。前端修复遵循 TypeScript 严格类型和 Zustand 切片模式；Rust 修复遵循 orphan rule 和 `thiserror` 错误模式。M5（bridge 文件命名统一）因影响 55 个文件，标注为可选/延后。

**Tech Stack:** React 19 + TypeScript + Zustand（前端）；Rust + Tauri 2.x + webview2_com（后端）；Vitest（前端测试）；cargo test（Rust 测试）

## Global Constraints

- 所有工作目录为 `e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\`
- 执行 npm/pnpm 命令前必须设置 PATH：`$env:Path = "D:\Program Files\nodejs;$env:Path"`
- 执行 cargo 命令前必须设置 PATH：`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
- 系统配置了 Clash 代理 (`127.0.0.1:7890`)，执行前确保代理已开启
- 所有修改不得破坏现有功能以及 UI/UX
- TypeScript 风格：禁止 `any`、禁止 `else`（用提前返回）、`const` 优先、禁止 import 别名
- Rust 风格：禁止 `unwrap()`、遵循 `rustfmt` 默认配置
- Commit 信息格式：`type(scope): summary`，scope 选项：`core`/`frontend`/`rust`/`stores`/`browser`/`terminal`/`ipc`/`docs`/`deps`
- 规则文件真源目录为 `.agents/rules/`，修改后同步到 `.trae/rules/`

---

### Task 1: M1 + M2 — 空 catch 修复 + 文档漂移修复

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx:87-91`
- Modify: `.trae/rules/tauri-shell.md:28,137`（以及同步到 `.agents/rules/tauri-shell.md`）

**Interfaces:**
- Consumes: 无（独立修复）
- Produces: 无（不引入新接口）

**背景：**
- M1：`LocalPortSection.tsx` 第 87 行 `catch {}` 空块违反 `error-handling.md` 规则"禁止 `try { ... } catch {}` 空 catch 块"。端口扫描失败时错误被静默吞下，无任何日志可追踪。
- M2：`tauri-shell.md` 两处声称 `DigitalLifeBridge` 有 13 个子接口，但 `frontend/src/shared/ipc/digital-life.ts:8-34` 实际导入了 27 个子接口类型。文档漂移导致新增域时遗漏同步检查。

- [ ] **Step 1: 修复 M1 — LocalPortSection.tsx 空 catch 块**

修改 `ai-digital-life/frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx` 第 87-88 行。

当前代码（第 87-91 行）：
```typescript
    } catch {
    } finally {
      scanningRef.current = false;
      browserSetPortScanning(false);
    }
```

替换为：
```typescript
    } catch (e) {
      console.warn('[LocalPortSection] port scan failed:', e);
    } finally {
      scanningRef.current = false;
      browserSetPortScanning(false);
    }
```

- [ ] **Step 2: 修复 M2 — 更新 tauri-shell.md 子接口数量（第一处）**

修改 `.trae/rules/tauri-shell.md` 第 28 行。

当前代码：
```
| `frontend/src/shared/ipc/index.ts` | `DigitalLifeBridge` 类型定义（域拆分为 13 个子接口，见 `shared/ipc/*.ts`） |
```

替换为：
```
| `frontend/src/shared/ipc/digital-life.ts` | `DigitalLifeBridge` 类型定义（域拆分为 27 个子接口，见 `shared/ipc/*.ts`） |
```

- [ ] **Step 3: 修复 M2 — 更新 tauri-shell.md 子接口列表（第二处）**

修改 `.trae/rules/tauri-shell.md` 第 137 行。

当前代码：
```
- `DigitalLifeBridge` 接口必须按领域拆分为命名子接口（当前 13 个：`window`, `app`, `workspace`, `retrieval`, `conversation`, `agent`, `patch`, `command`, `pty`, `task`, `run-activity`, `browser`, `github`）
```

替换为：
```
- `DigitalLifeBridge` 接口必须按领域拆分为命名子接口（当前 27 个：`window`, `app`, `workspace`, `retrieval`, `conversation`, `agent`, `subagent`, `mcp`, `patch`, `provider`, `command`, `pty`, `task`, `run-activity`, `browser`, `github`, `snapshot`, `web-tools`, `commands-config`, `permission`, `compaction`, `session-fork`, `lsp`, `reference`, `durable`, `reserved`, `custom-agent`；注：`ci` 属性复用 `GitHubBridge` 接口，不计入独立子接口数）
```

- [ ] **Step 4: 同步规则文件到 .agents/rules/**

检查 `.agents/rules/tauri-shell.md` 是否存在。如果存在，将 Step 2 和 Step 3 的相同修改同步到该文件（真源目录）。

```powershell
# 检查文件是否存在
Test-Path "e:\AI-DIGITAL-LIFE\SourceWorkspace\.agents\rules\tauri-shell.md"
```

如果存在，对 `.agents/rules/tauri-shell.md` 执行与 Step 2、Step 3 完全相同的两处文本替换。

- [ ] **Step 5: 运行前端 lint 和 typecheck 验证 M1**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run lint:fix
pnpm --dir ai-digital-life/frontend run typecheck
```

Expected: lint 无 error，typecheck 通过（`catch (e)` 不改变类型签名，`console.warn` 是标准 API）。

- [ ] **Step 6: 提交 M1 和 M2**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace
git add ai-digital-life/frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx
git commit -m "fix(browser): add error logging to LocalPortSection port scan catch

Empty catch block violated error-handling.md rule. Now logs scan failures
with console.warn for traceability."

git add .trae/rules/tauri-shell.md .agents/rules/tauri-shell.md
git commit -m "docs(core): update tauri-shell.md sub-interface count from 13 to 27

Document drift: digital-life.ts imports 27 sub-interface types but docs
said 13. Updated both the contract source table and the bridge interface
list with all 27 domains."
```

---

### Task 2: M3 — 提取共享常量 STORAGE_HYDRATION_DELAY_MS

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/constants.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts:88`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/browserSlice.ts:10,179`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/uiSlice.ts:7,135`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts:122`

**Interfaces:**
- Consumes: 无
- Produces: `STORAGE_HYDRATION_DELAY_MS`（导出自 `stores/constants.ts`，类型 `number`，值 `200`）

**背景：** 4 个 slice 文件中各自硬编码了 `setTimeout(doHydrate, 200)` 作为 `requestIdleCallback` 不可用时的回退延迟。魔术数字 `200` 重复 4 次，修改时容易遗漏。提取为共享常量。

- [ ] **Step 1: 在 constants.ts 中添加共享常量**

修改 `ai-digital-life/frontend/src/app/stores/constants.ts`。

当前完整内容：
```typescript
export const BROWSER_NAVIGATOR_COLLAPSED_KEY = 'adl-ui:navigator-collapsed';
```

替换为：
```typescript
export const BROWSER_NAVIGATOR_COLLAPSED_KEY = 'adl-ui:navigator-collapsed';

/**
 * localStorage 惰性水合的回退延迟（毫秒）。
 *
 * 当 requestIdleCallback 不可用时（如 jsdom 测试环境），
 * 各 slice 使用此延迟通过 setTimeout 执行水合，避免阻塞首屏渲染。
 */
export const STORAGE_HYDRATION_DELAY_MS = 200;
```

- [ ] **Step 2: 在 workspaceSlice.ts 中使用常量**

修改 `ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts`。

在文件顶部 import 区域（第 11 行 `import type { StoreState } from '../StoreState';` 之后）添加导入：
```typescript
import { STORAGE_HYDRATION_DELAY_MS } from '../constants';
```

将第 88 行：
```typescript
    setTimeout(doHydrate, 200);
```
替换为：
```typescript
    setTimeout(doHydrate, STORAGE_HYDRATION_DELAY_MS);
```

- [ ] **Step 3: 在 browserSlice.ts 中使用常量**

修改 `ai-digital-life/frontend/src/app/stores/slices/browserSlice.ts`。

第 10 行已有导入：
```typescript
import { BROWSER_NAVIGATOR_COLLAPSED_KEY } from '../constants';
```
替换为：
```typescript
import { BROWSER_NAVIGATOR_COLLAPSED_KEY, STORAGE_HYDRATION_DELAY_MS } from '../constants';
```

将第 179 行：
```typescript
    setTimeout(doHydrate, 200);
```
替换为：
```typescript
    setTimeout(doHydrate, STORAGE_HYDRATION_DELAY_MS);
```

- [ ] **Step 4: 在 uiSlice.ts 中使用常量**

修改 `ai-digital-life/frontend/src/app/stores/slices/uiSlice.ts`。

第 7 行已有导入：
```typescript
import { BROWSER_NAVIGATOR_COLLAPSED_KEY } from '../constants';
```
替换为：
```typescript
import { BROWSER_NAVIGATOR_COLLAPSED_KEY, STORAGE_HYDRATION_DELAY_MS } from '../constants';
```

将第 135 行：
```typescript
    setTimeout(doHydrate, 200);
```
替换为：
```typescript
    setTimeout(doHydrate, STORAGE_HYDRATION_DELAY_MS);
```

- [ ] **Step 5: 在 terminalSlice.ts 中使用常量**

修改 `ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts`。

在文件顶部 import 区域（第 6 行 `import type { ToolId } from '../types';` 之后，或第 36 行 `import { clamp, readJson, readNumber, createUiId, createDebouncedWrite } from '../shared';` 之后）添加导入：
```typescript
import { STORAGE_HYDRATION_DELAY_MS } from '../constants';
```

将第 122 行：
```typescript
    setTimeout(doHydrate, 200);
```
替换为：
```typescript
    setTimeout(doHydrate, STORAGE_HYDRATION_DELAY_MS);
```

- [ ] **Step 6: 运行前端 lint、typecheck 和测试验证**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run lint:fix
pnpm --dir ai-digital-life/frontend run format
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run test
```

Expected: 全部通过。常量替换不改变运行时行为（值仍为 200），现有 slice 测试应全部通过。

- [ ] **Step 7: 提交**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace
git add ai-digital-life/frontend/src/app/stores/constants.ts ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts ai-digital-life/frontend/src/app/stores/slices/browserSlice.ts ai-digital-life/frontend/src/app/stores/slices/uiSlice.ts ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts
git commit -m "refactor(stores): extract STORAGE_HYDRATION_DELAY_MS shared constant

Replace magic number 200 in 4 slice files with named constant from
constants.ts. Improves maintainability — hydration delay now has a
single source of truth."
```

---

### Task 3: M4 — AppConfig ↔ LogConfig 所有权关系文档化 + 转换方法

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/config.rs:14-21,47-65`
- Modify: `ai-digital-life/crates/adl-logging/src/config.rs:4-8`

**Interfaces:**
- Consumes: `adl_logging::LogMode`（kernel 已依赖）
- Produces: `AppConfig::to_log_config(&self) -> adl_logging::config::LogConfig`（kernel crate 新增方法）

**背景：** `AppConfig`（kernel）和 `LogConfig`（adl-logging）都有 `terminal_log_mode` 和 `debug_log_mode` 字段，存在字段重复。由于 orphan rule，kernel 无法为外部类型 `LogConfig` 实现 `From<&AppConfig>`，因此采用 `AppConfig::to_log_config()` 方法（AppConfig 是 kernel 本地类型，可以为它添加方法）+ 文档注释说明所有权关系。

- [ ] **Step 1: 为 LogConfig 添加所有权关系文档注释**

修改 `ai-digital-life/crates/adl-logging/src/config.rs` 第 4-8 行。

当前代码：
```rust
#[derive(Debug, Clone)]
pub struct LogConfig {
    pub terminal_log_mode: LogMode,
    pub debug_log_mode: LogMode,
}
```

替换为：
```rust
/// 日志子系统运行时配置（非持久化视图）。
///
/// 所有权关系：此结构体是 `kernel::config::AppConfig` 的子视图，
/// 仅包含日志模式字段。`AppConfig` 是配置真源（序列化到 config.json），
/// 本结构体通过 `AppConfig::to_log_config()` 派生，不独立持久化。
/// 重复字段是有意设计：AppConfig 拥有完整配置，LogConfig 拥有日志子系统的运行时快照。
#[derive(Debug, Clone)]
pub struct LogConfig {
    pub terminal_log_mode: LogMode,
    pub debug_log_mode: LogMode,
}
```

- [ ] **Step 2: 为 AppConfig 的日志字段添加文档注释**

修改 `ai-digital-life/crates/kernel/src/config.rs` 第 18-21 行。

当前代码：
```rust
    #[serde(default)]
    pub terminal_log_mode: LogMode,
    #[serde(default)]
    pub debug_log_mode: LogMode,
```

替换为：
```rust
    /// 终端日志模式（派生为 LogConfig.terminal_log_mode）。
    #[serde(default)]
    pub terminal_log_mode: LogMode,
    /// 调试日志模式（派生为 LogConfig.debug_log_mode）。
    #[serde(default)]
    pub debug_log_mode: LogMode,
```

- [ ] **Step 3: 为 AppConfig 添加 to_log_config() 方法**

修改 `ai-digital-life/crates/kernel/src/config.rs`，在 `impl Default for AppConfig` 块之前（第 46 行之前）插入新的 impl 块。

在第 45 行（`}` 闭合 AppConfig 结构体）和第 47 行（`impl Default for AppConfig {`）之间插入：
```rust
impl AppConfig {
    /// 从 AppConfig 提取 LogConfig（日志子系统运行时视图）。
    ///
    /// 所有权关系：AppConfig 是配置真源，LogConfig 是其子视图。
    /// 调用方应通过此方法派生 LogConfig，避免手动复制字段导致不一致。
    pub fn to_log_config(&self) -> adl_logging::config::LogConfig {
        adl_logging::config::LogConfig {
            terminal_log_mode: self.terminal_log_mode.clone(),
            debug_log_mode: self.debug_log_mode.clone(),
        }
    }
}

```

- [ ] **Step 4: 编写测试验证 to_log_config() 转换正确性**

修改 `ai-digital-life/crates/kernel/src/config.rs`，在文件末尾的 `#[cfg(test)]` 模块中（第一个 tests 模块内，第 113 行 `}` 之前）添加测试函数。

在 `default_config_round_trips` 测试函数之后添加：
```rust

    #[test]
    fn to_log_config_derives_correct_modes() {
        let mut config = AppConfig::default();
        config.terminal_log_mode = LogMode::Overwrite;
        config.debug_log_mode = LogMode::Multi;
        let log_config = config.to_log_config();
        assert_eq!(log_config.terminal_log_mode, LogMode::Overwrite);
        assert_eq!(log_config.debug_log_mode, LogMode::Multi);
    }
```

- [ ] **Step 5: 运行 Rust 格式化、clippy、编译检查和测试**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
cargo test --workspace -p kernel
```

Expected: `cargo test -p kernel` 中 `to_log_config_derives_correct_modes` 测试通过。

- [ ] **Step 6: 提交**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace
git add ai-digital-life/crates/kernel/src/config.rs ai-digital-life/crates/adl-logging/src/config.rs
git commit -m "docs(rust): document AppConfig↔LogConfig ownership and add to_log_config()

Add doc comments explaining that AppConfig owns the config source-of-truth
and LogConfig is a non-persisted runtime view. Add to_log_config() method
to derive LogConfig without manual field copying. Orphan rule prevents
impl From<&AppConfig> for LogConfig since both types are in different
crates — method on local type AppConfig is the idiomatic workaround."
```

---

### Task 4: M6 — generalActions.ts 提取 accumulateBatch 辅助函数

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/actions/generalActions.ts:1-12,140-189`
- Test: `ai-digital-life/frontend/src/app/stores/actions/generalActions.test.ts`

**Interfaces:**
- Consumes: `StoreState`（类型）、`StoreApi`（Zustand）
- Produces: `accumulateBatch`（导出函数，泛型辅助，供本文件和测试使用）

**背景：** `generalActions.ts` 的 `bootstrap` action 中有 4 个重复的批量初始化块，每个都遵循 `if (!batch.X) { batch.X = { ...get().X }; } batch.X[id] = value;` 模式。提取为 `accumulateBatch` 泛型辅助函数消除重复，降低嵌套深度。

- [ ] **Step 1: 在 generalActions.ts 中添加 accumulateBatch 辅助函数**

修改 `ai-digital-life/frontend/src/app/stores/actions/generalActions.ts`。

在第 10 行 `import type { StoreApi } from 'zustand';` 之后、第 12 行 `export function createGeneralActions` 之前，插入辅助函数和导出声明：

```typescript
/**
 * 批量累加辅助函数 — 在 Partial<StoreState> 中累积 Record 字段的变更。
 *
 * 首次调用时从当前 store 状态浅拷贝初始化 batch 字段，
 * 后续调用直接在已初始化的 batch 字段上追加，避免每次都展开整个 Record。
 *
 * @param batch - 累积变更的 Partial<StoreState> 对象
 * @param get - Zustand store 的 get 函数，用于读取当前状态
 * @param key - StoreState 中类型为 Record<string, V> 的字段名
 * @param id - 要写入的 Record key
 * @param value - 要写入的 Record value
 */
export function accumulateBatch<K extends keyof StoreState>(
  batch: Partial<StoreState>,
  get: () => StoreState,
  key: K,
  id: string,
  value: StoreState[K] extends Record<string, infer V> ? V : never
): void {
  if (!batch[key]) {
    batch[key] = { ...(get()[key] as Record<string, unknown>) } as StoreState[K];
  }
  (batch[key] as Record<string, unknown>)[id] = value;
}
```

- [ ] **Step 2: 用 accumulateBatch 替换 4 个重复块**

修改 `ai-digital-life/frontend/src/app/stores/actions/generalActions.ts` 中 `bootstrap` action 内的 `for` 循环（约第 157-181 行）。

当前代码：
```typescript
            const batch: Partial<StoreState> = {};
            for (const r of wsResults) {
              if (r.status !== 'fulfilled') {
                continue;
              }
              const { id, tree, snapshot } = r.value;
              if (tree !== undefined) {
                if (!batch.workspaceTrees) {
                  batch.workspaceTrees = { ...get().workspaceTrees };
                }
                batch.workspaceTrees[id] = tree;
                if (!batch.workspaceTreeLoading) {
                  batch.workspaceTreeLoading = { ...get().workspaceTreeLoading };
                }
                batch.workspaceTreeLoading[id] = false;
              }
              if (snapshot !== undefined) {
                if (!batch.gitSnapshots) {
                  batch.gitSnapshots = { ...get().gitSnapshots };
                }
                batch.gitSnapshots[id] = snapshot;
                if (!batch.workspaceChangesTreeLoading) {
                  batch.workspaceChangesTreeLoading = { ...get().workspaceChangesTreeLoading };
                }
                batch.workspaceChangesTreeLoading[id] = false;
              }
            }
```

替换为：
```typescript
            const batch: Partial<StoreState> = {};
            for (const r of wsResults) {
              if (r.status !== 'fulfilled') {
                continue;
              }
              const { id, tree, snapshot } = r.value;
              if (tree !== undefined) {
                accumulateBatch(batch, get, 'workspaceTrees', id, tree);
                accumulateBatch(batch, get, 'workspaceTreeLoading', id, false);
              }
              if (snapshot !== undefined) {
                accumulateBatch(batch, get, 'gitSnapshots', id, snapshot);
                accumulateBatch(batch, get, 'workspaceChangesTreeLoading', id, false);
              }
            }
```

- [ ] **Step 3: 编写 accumulateBatch 单元测试**

修改 `ai-digital-life/frontend/src/app/stores/actions/generalActions.test.ts`，在文件末尾添加测试块。

在文件末尾追加：
```typescript

describe('accumulateBatch', () => {
  // 构造最小 StoreState 子集，仅包含测试所需的 Record 字段
  function makeMockGet(overrides: Partial<StoreState> = {}): () => StoreState {
    const base = {
      workspaceTrees: {},
      workspaceTreeLoading: {},
      gitSnapshots: {},
      workspaceChangesTreeLoading: {},
    } as unknown as StoreState;
    return () => ({ ...base, ...overrides } as StoreState);
  }

  it('initializes batch field from store state on first call', () => {
    const batch: Partial<StoreState> = {};
    const get = makeMockGet({
      workspaceTrees: { existing: [] } as unknown as StoreState['workspaceTrees'],
    });
    accumulateBatch(batch, get, 'workspaceTrees', 'new-id', [] as never);
    expect(batch.workspaceTrees).toBeDefined();
    expect(batch.workspaceTrees).toHaveProperty('existing');
    expect(batch.workspaceTrees).toHaveProperty('new-id');
  });

  it('accumulates multiple entries into same batch field', () => {
    const batch: Partial<StoreState> = {};
    const get = makeMockGet();
    accumulateBatch(batch, get, 'workspaceTreeLoading', 'id1', false);
    accumulateBatch(batch, get, 'workspaceTreeLoading', 'id2', false);
    expect(batch.workspaceTreeLoading).toHaveProperty('id1', false);
    expect(batch.workspaceTreeLoading).toHaveProperty('id2', false);
  });

  it('does not re-initialize batch field on subsequent calls', () => {
    const batch: Partial<StoreState> = {};
    const get = makeMockGet({
      gitSnapshots: { stale: { id: 'stale' } } as unknown as StoreState['gitSnapshots'],
    });
    accumulateBatch(batch, get, 'gitSnapshots', 'first', { id: 'first' } as never);
    // 第二次调用不应重新从 get() 拷贝（否则会覆盖 first）
    accumulateBatch(batch, get, 'gitSnapshots', 'second', { id: 'second' } as never);
    expect(batch.gitSnapshots).toHaveProperty('first');
    expect(batch.gitSnapshots).toHaveProperty('second');
    // stale 不应在 batch 中（batch 从 get() 拷贝时包含 stale，但第一次调用后就不再拷贝）
    expect(batch.gitSnapshots).toHaveProperty('stale');
  });
});
```

需要在文件顶部添加 `accumulateBatch` 的导入。在现有导入行 `import { useAppStore } from '../slicedStore';` 之后添加：
```typescript
import { accumulateBatch } from './generalActions';
```

- [ ] **Step 4: 运行前端 lint、typecheck 和测试验证**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run lint:fix
pnpm --dir ai-digital-life/frontend run format
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run test -- --reporter=verbose generalActions
```

Expected: `accumulateBatch` 的 3 个测试全部通过；现有 `updatePreferences` 测试不受影响。

- [ ] **Step 5: 提交**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace
git add ai-digital-life/frontend/src/app/stores/actions/generalActions.ts ai-digital-life/frontend/src/app/stores/actions/generalActions.test.ts
git commit -m "refactor(stores): extract accumulateBatch helper in generalActions

Replace 4 repeated batch initialization blocks in bootstrap action with
a generic accumulateBatch<K> helper. Reduces nesting depth and eliminates
duplicate 'if (!batch.X) { batch.X = {...get().X} } batch.X[id] = value'
pattern. Adds 3 unit tests covering initialization, accumulation, and
no-re-init behavior."
```

---

### Task 5: M7 — webview2_favicon.rs 提取 handle_favicon_changed 自由函数

**Files:**
- Modify: `ai-digital-life/crates/browser/src/webview2_favicon.rs:36-87`

**Interfaces:**
- Consumes: `ICoreWebView2`、`IUnknown`、`ICoreWebView2_15`（来自 webview2_com / windows crate）
- Produces: `handle_favicon_changed`（私有自由函数，仅本模块内使用）

**背景：** `setup_favicon_changed_handler` 中 `FaviconChangedEventHandler::create` 的闭包有 6 层嵌套（闭包 → `let Some` → `match` → `if let Err` → `if` → `if let Ok`）。提取为自由函数 `handle_favicon_changed` 后，闭包变为单行委托，嵌套深度降至 1 层。

- [ ] **Step 1: 提取 handle_favicon_changed 自由函数**

修改 `ai-digital-life/crates/browser/src/webview2_favicon.rs`。

在 `mod imp` 块内（第 22 行 `use crate::webview2_message::shared::{FAVICON_CACHE, FAVICON_CHANGED_COUNT};` 之后）、`pub fn setup_favicon_changed_handler` 之前（第 23 行之前），插入自由函数：

```rust
    /// FaviconChanged 事件处理逻辑（从闭包提取为自由函数，降低嵌套深度）。
    ///
    /// 获取 favicon URI 和页面 URL，缓存到 `FAVICON_CACHE` 并递增计数器。
    /// 所有错误路径均静默返回 `Ok(())`，因为 favicon 检测是尽力而为的增强功能。
    fn handle_favicon_changed(
        sender: Option<ICoreWebView2>,
        _args: Option<IUnknown>,
    ) -> windows::core::Result<()> {
        let Some(sender) = sender else {
            return Ok(());
        };

        let core15: ICoreWebView2_15 = match sender.cast() {
            Ok(c) => c,
            Err(_) => return Ok(()),
        };

        let mut favicon_pwstr = windows::core::PWSTR::null();
        if let Err(e) = core15.FaviconUri(&mut favicon_pwstr) {
            debug!(
                "[ADL-META-RECV] Method 4 (FaviconChanged): FaviconUri() failed: {}",
                e
            );
            return Ok(());
        }
        let favicon = if favicon_pwstr.is_null() {
            String::new()
        } else {
            take_pwstr(favicon_pwstr)
        };
        if favicon.is_empty() {
            return Ok(());
        }

        let mut url_pwstr = windows::core::PWSTR::null();
        if let Err(_e) = sender.Source(&mut url_pwstr) {
            return Ok(());
        }
        let url = if url_pwstr.is_null() { String::new() } else { take_pwstr(url_pwstr) };

        if !url.is_empty() {
            if let Ok(mut cache) = FAVICON_CACHE.write() {
                cache.insert(url.clone(), favicon.clone());
            }
        }

        let count = FAVICON_CHANGED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
        debug!(
            "[ADL-META-RECV] ◄ Method 4 (FaviconChanged): CACHED ✓ (#{}) | favicon: {} | url: {}",
            count,
            favicon.chars().take(50).collect::<String>(),
            url.chars().take(80).collect::<String>()
        );

        Ok(())
    }

```

- [ ] **Step 2: 用自由函数替换闭包体**

修改 `ai-digital-life/crates/browser/src/webview2_favicon.rs` 中 `setup_favicon_changed_handler` 函数内的闭包（约第 36-87 行）。

当前代码：
```rust
            let handler = FaviconChangedEventHandler::create(Box::new(
                move |sender: Option<ICoreWebView2>, _args: Option<IUnknown>| {
                    let Some(sender) = sender else {
                        return Ok(());
                    };

                    let core15: ICoreWebView2_15 = match sender.cast() {
                        Ok(c) => c,
                        Err(_) => return Ok(()),
                    };

                    let mut favicon_pwstr = windows::core::PWSTR::null();
                    if let Err(e) = core15.FaviconUri(&mut favicon_pwstr) {
                        debug!(
                            "[ADL-META-RECV] Method 4 (FaviconChanged): FaviconUri() failed: {}",
                            e
                        );
                        return Ok(());
                    }
                    let favicon = if favicon_pwstr.is_null() {
                        String::new()
                    } else {
                        take_pwstr(favicon_pwstr)
                    };
                    if favicon.is_empty() {
                        return Ok(());
                    }

                    let mut url_pwstr = windows::core::PWSTR::null();
                    if let Err(_e) = sender.Source(&mut url_pwstr) {
                        return Ok(());
                    }
                    let url =
                        if url_pwstr.is_null() { String::new() } else { take_pwstr(url_pwstr) };

                    if !url.is_empty() {
                        if let Ok(mut cache) = FAVICON_CACHE.write() {
                            cache.insert(url.clone(), favicon.clone());
                        }
                    }

                    let count = FAVICON_CHANGED_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
                    debug!(
                        "[ADL-META-RECV] ◄ Method 4 (FaviconChanged): CACHED ✓ (#{}) | favicon: {} | url: {}",
                        count,
                        favicon.chars().take(50).collect::<String>(),
                        url.chars().take(80).collect::<String>()
                    );

                    Ok(())
                },
            ));
```

替换为：
```rust
            let handler = FaviconChangedEventHandler::create(Box::new(handle_favicon_changed));
```

- [ ] **Step 3: 运行 Rust 格式化、clippy、编译检查和测试**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
cargo test --workspace -p adl-browser
```

Expected: 编译通过（Windows 平台编译 `#[cfg(windows)]` 模块）；clippy 无 warning；现有 browser crate 测试通过。函数签名为 `fn(Option<ICoreWebView2>, Option<IUnknown>) -> windows::core::Result<()>`，匹配 `FaviconChangedEventHandler::create` 期望的 `Box<dyn FnMut(...)>` trait bound。

- [ ] **Step 4: 提交**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace
git add ai-digital-life/crates/browser/src/webview2_favicon.rs
git commit -m "refactor(browser): extract handle_favicon_changed from FaviconChanged closure

Reduce nesting depth from 6 levels to 1 by extracting the closure body
into a free function. The closure now delegates directly to
handle_favicon_changed. Behavior is unchanged — all error paths still
return Ok(()) silently."
```

---

### Task 6: M5 — Bridge 层文件命名统一（可选/延后）

> **⚠️ 此 Task 为可选/延后项。** 影响 55 个文件的重命名 + 导入路径更新，机械工作量大且容易引入回归。建议在专门的独立分支中执行，配合 CI 检查验证。如时间紧迫可跳过此 Task，不影响 M1-M4、M6-M7 的修复价值。

**Files:**
- Rename: `ai-digital-life/frontend/src/tauri-bridge/` 下 17 个文件
- Rename: `ai-digital-life/frontend/src/preview-bridge/` 下 4 个不一致文件
- Rename: `ai-digital-life/frontend/src/mock/` 下部分文件
- Modify: 所有引用上述文件的 import 路径（约 30+ 个引用文件）

**Interfaces:**
- Consumes: 无
- Produces: 统一的 `<bridge>-<domain>.ts` 命名约定

**背景：** 三个 bridge 层目录的文件命名不一致：

| 目录 | 当前命名 | 文件数 | 问题 |
|------|---------|--------|------|
| `tauri-bridge/` | `<domain>.ts`（无前缀） | 17 | 缺少 `tauri-` 前缀，与目录名不一致 |
| `preview-bridge/` | `preview-<domain>.ts` 混合 | 18 | `api.ts`、`index.ts`、`storage.ts`、`ptyBridge.ts` 无前缀 |
| `mock/` | `mock-<domain>.ts` + `mock-shared-<domain>.ts` | 20 | 基本一致，但 `shared.ts` 无前缀 |

**目标命名约定：** `<bridge>-<domain>.ts`（index.ts 保留不变，作为目录入口）

- [ ] **Step 1: 制定重命名策略（不执行代码修改）**

**tauri-bridge/ 重命名计划（17 个文件）：**
- `agent.ts` → `tauri-agent.ts`
- `browser.ts` → `tauri-browser.ts`
- `ci-github.ts` → `tauri-ci-github.ts`
- `compaction.ts` → `tauri-compaction.ts`
- `conversation.ts` → `tauri-conversation.ts`
- `durable.ts` → `tauri-durable.ts`
- `lsp.ts` → `tauri-lsp.ts`
- `misc.ts` → `tauri-misc.ts`
- `permission.ts` → `tauri-permission.ts`
- `provider.ts` → `tauri-provider.ts`
- `pty.ts` → `tauri-pty.ts`
- `reference.ts` → `tauri-reference.ts`
- `shared.ts` → `tauri-shared.ts`
- `snapshot.ts` → `tauri-snapshot.ts`
- `web-tools.ts` → `tauri-web-tools.ts`
- `workspace.ts` → `tauri-workspace.ts`
- `index.ts` → 保留不变（目录入口）

**preview-bridge/ 重命名计划（4 个不一致文件）：**
- `api.ts` → `preview-api.ts`
- `storage.ts` → `preview-storage.ts`
- `ptyBridge.ts` → `preview-pty-bridge.ts`（统一用连字符，不用 camelCase）
- `index.ts` → 保留不变
- 其余 `preview-*.ts` 文件已符合约定，无需修改

**mock/ 重命名计划（1 个不一致文件）：**
- `shared.ts` → `mock-shared.ts`
- 其余 `mock-*.ts` 文件已符合约定，无需修改

- [ ] **Step 2: 执行重命名和导入路径更新（仅在实际执行此 Task 时操作）**

对每个重命名的文件：
1. 使用 `git mv` 重命名文件
2. 使用 Grep 搜索所有引用旧文件名的 import 语句
3. 更新 import 路径为新文件名
4. 运行 typecheck 验证无遗漏

```powershell
# 示例：重命名 tauri-bridge/workspace.ts
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git mv frontend/src/tauri-bridge/workspace.ts frontend/src/tauri-bridge/tauri-workspace.ts
```

```powershell
# 搜索所有引用（使用 Grep 工具，不是命令行）
# 搜索模式：from '.*tauri-bridge/workspace' 或 from '.*/workspace' (相对路径)
```

- [ ] **Step 3: 添加 CI 命名检查脚本（可选，防止回退）**

创建 `ai-digital-life/scripts/check-bridge-naming.ts`（如选择此步）：

```typescript
/**
 * 检查 bridge 层文件命名是否符合 <bridge>-<domain>.ts 约定。
 * 在 CI 中作为 pre-commit 或 lint 步骤运行。
 */
import { readdirSync } from 'fs';
import { join } from 'path';

const BRIDGE_DIRS = [
  'frontend/src/tauri-bridge',
  'frontend/src/preview-bridge',
  'frontend/src/mock',
];

const EXPECTED_PREFIXES: Record<string, string> = {
  'frontend/src/tauri-bridge': 'tauri-',
  'frontend/src/preview-bridge': 'preview-',
  'frontend/src/mock': 'mock-',
};

const ALLOWED_UNPREFIXED = new Set(['index.ts']);

function checkBridgeNaming(rootDir: string): string[] {
  const violations: string[] = [];
  for (const dir of BRIDGE_DIRS) {
    const fullPath = join(rootDir, dir);
    const prefix = EXPECTED_PREFIXES[dir];
    let files: string[];
    try {
      files = readdirSync(fullPath).filter((f) => f.endsWith('.ts'));
    } catch {
      continue;
    }
    for (const file of files) {
      if (ALLOWED_UNPREFIXED.has(file)) {
        continue;
      }
      if (!file.startsWith(prefix)) {
        violations.push(`${dir}/${file} — expected prefix "${prefix}"`);
      }
    }
  }
  return violations;
}

const rootDir = process.argv[2] ?? '.';
const violations = checkBridgeNaming(rootDir);
if (violations.length > 0) {
  console.error('Bridge naming violations:');
  for (const v of violations) {
    console.error(`  ${v}`);
  }
  process.exit(1);
} else {
  console.log('✓ All bridge files follow naming convention.');
}
```

- [ ] **Step 4: 验证（仅在实际执行此 Task 时操作）**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run test
pnpm --dir ai-digital-life/frontend run lint

# 运行命名检查脚本
npx tsx ai-digital-life/scripts/check-bridge-naming.ts ai-digital-life
```

Expected: typecheck 通过（所有 import 路径已更新），测试通过，命名检查脚本输出 ✓。

- [ ] **Step 5: 提交（仅在实际执行此 Task 时操作）**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace
git add -A
git commit -m "refactor(ipc): unify bridge file naming convention to <bridge>-<domain>.ts

Rename 22 files across tauri-bridge/, preview-bridge/, and mock/ to
follow consistent <bridge>-<domain>.ts naming. Add CI check script to
prevent regression. index.ts entries are exempted as directory entry
points."
```

---

## Self-Review

### 1. Spec coverage（规格覆盖检查）

逐项检查 M1-M7 是否有对应 Task：

| 发现 | 修复内容 | 对应 Task | 状态 |
|------|---------|-----------|------|
| M1 | LocalPortSection.tsx 空 catch 块 → 添加 console.warn | Task 1 Step 1 | ✅ 覆盖 |
| M2 | tauri-shell.md "13" → "27" + 列表更新 | Task 1 Step 2-4 | ✅ 覆盖 |
| M3 | 4 个 slice 的 200ms 魔术数字 → 共享常量 | Task 2 Step 1-5 | ✅ 覆盖 |
| M4 | AppConfig ↔ LogConfig 字段重复 → 文档注释 + to_log_config() | Task 3 Step 1-4 | ✅ 覆盖 |
| M5 | bridge 命名不一致 → 统一命名约定 | Task 6 Step 1-5 | ✅ 覆盖（标注可选/延后） |
| M6 | generalActions 4 层重复块 → accumulateBatch 辅助函数 | Task 4 Step 1-4 | ✅ 覆盖 |
| M7 | webview2_favicon 6 层嵌套 → 提取自由函数 | Task 5 Step 1-3 | ✅ 覆盖 |

### 2. Placeholder scan（占位符扫描）

检查计划中是否存在以下红旗模式：
- ❌ "TBD" / "TODO" / "implement later" — 无
- ❌ "Add appropriate error handling" — 无
- ❌ "Write tests for the above"（无实际测试代码） — 无，每个测试都有完整代码
- ❌ "Similar to Task N"（不重复代码） — 无
- ❌ 步骤只描述做什么不展示怎么做 — 无，每个代码步骤都有完整代码块

### 3. Type consistency（类型一致性检查）

| 符号 | 定义位置 | 使用位置 | 一致性 |
|------|---------|---------|--------|
| `STORAGE_HYDRATION_DELAY_MS` | Task 2 Step 1 (`constants.ts`) | Task 2 Step 2-5（4 个 slice） | ✅ 名称和导入路径一致 |
| `accumulateBatch<K>` | Task 4 Step 1 (`generalActions.ts`) | Task 4 Step 2（bootstrap）、Step 3（测试） | ✅ 泛型签名和参数顺序一致 |
| `handle_favicon_changed` | Task 5 Step 1 (`webview2_favicon.rs`) | Task 5 Step 2（闭包委托） | ✅ 函数名和签名一致 |
| `AppConfig::to_log_config` | Task 3 Step 3 (`config.rs`) | Task 3 Step 4（测试调用） | ✅ 方法名和返回类型一致 |
| `LogConfig` | Task 3 Step 1 (`adl-logging/config.rs`) | Task 3 Step 3（to_log_config 返回类型） | ✅ 结构体名和字段一致 |

### 4. 关键设计决策说明

1. **M4 未使用 `impl From<&AppConfig> for LogConfig`：** Rust orphan rule 规定，只有当 trait 或类型之一在当前 crate 定义时，才能实现该 trait。`From`（std）和 `LogConfig`（adl-logging）都不在 kernel crate 中，因此 kernel 无法为 `LogConfig` 实现 `From`。替代方案是在本地类型 `AppConfig` 上添加 `to_log_config()` 方法，这是惯用的 Rust 模式。

2. **M3 中 `constants.ts` 已存在：** 计划中是修改（追加）已有文件，而非创建新文件。该文件当前仅有一行 `BROWSER_NAVIGATOR_COLLAPSED_KEY` 导出，两个 slice 已从中导入。

3. **M5 标注为可选/延后：** 55 个文件的重命名机械工作量大，且 import 路径更新容易遗漏。计划中提供了完整的重命名策略和 CI 检查脚本，但标注为可选，确保 M1-M4、M6-M7 的修复价值不受阻塞。

4. **M6 的 `accumulateBatch` 泛型约束：** 使用条件类型 `StoreState[K] extends Record<string, infer V> ? V : never` 从 Record 字段提取值类型，确保类型安全。`as Record<string, unknown>` 转换是 TypeScript 中操作泛型 Record 的必要手段，不违反"禁止 any"规则。

5. **M2 中子接口计数为 27：** `digital-life.ts` 第 8-34 行导入了 27 个子接口类型（`GitHubBridge` 被 `github` 和 `ci` 属性共用，但只导入一次）。`DigitalLifeBridge` 接口有 28 个子模块属性（`ci` 复用 `GitHubBridge`），但独立子接口类型为 27 个。文档中以"27 个子接口"表述，并在列表注释中说明 `ci` 复用情况。
