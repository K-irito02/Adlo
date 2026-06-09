# 残余架构清理经验（Phase 41-42）

> 日期: 2026-06-09 | 来源: 重构洞察 2026-06-09 执行

## 问题背景

2026-06-09 重构洞察报告发现 18 项新增问题。在 Phase 41-42 中，选取了优先最高的 9 项进行修复，涵盖了前端死代码清理、切片耦合、bridge 层级越界、React.memo 缺失、Rust 参数过多、clone 消除、测试覆盖、package.json 分类等 8 个领域。

## 经验总结

### 1. Bridge 层共享工具的下沉策略

**问题**：`tauri-bridge.ts`、`preview-bridge/index.ts`、`mock-bridge.ts` 三个 bridge 文件都从 `app/utils/` 导入纯工具函数（`repoMapEntriesToTree`、`applyPreferencePatch`），违反架构层级约定（bridge 应只依赖 `shared/`）。

**方案**：使用「复制而非移动」策略——将工具函数复制到 `frontend/src/shared/`，bridge 层改用 `shared/` 路径。`app/utils/` 中的原始文件保留，因为 `app/` 内其他模块依然使用原始路径。这样避免了破坏现有导入链。

**经验**：下沉重构中，「复制+双路径共存的过渡方式」比「迁移+全仓库更新导入」更安全也更快。后续可在适当时机统一为单一来源。

### 2. React.memo 的「文件级」vs「组件内部」判断

**问题**：在 `FileNavigatorShell.tsx`（670 行，30 props）、`FilesPanel.tsx`（40 props）、`EditorSurfaceShell.tsx`（471 行）上缺失 `React.memo`。

**检查清单**：判断一个组件是否需要 React.memo 的标准：
- 是否接收 20+ 个 props（文件级编排组件）
- 是否作为父组件的直接子组件且频繁重渲染
- 是否不依赖每次渲染都变化的原始值（字符串/数字）

**经验**：三个文件都已 `import React`，只需将 `function Comp(props)` 改为 `const Comp = React.memo(function Comp(props))`。这种包装不改变类型签名，零风险。

### 3. Rust 参数过多——上下文结构体提取模式

**问题**：`call_model`（10 参数）、`finalize_run`（11 参数）、`save_and_emit_run_activity`（9 参数）被 `#[allow(clippy::too_many_arguments)]` 压制。

**方案**：为每个函数创建专用的上下文结构体（`CallModelContext`、`FinalizeRunContext`、`RunActivityContext`），将参数列表转为字段。

**陷阱**：带生命周期的字段（如 `&'a AppState`）需要结构体也带有生命周期参数。闭包参数（`impl Fn(...)`）在结构体中需用泛型或 `Box<dyn Fn>`。`async fn` 中的结构体引用需要注意生命周期是否足够长。

**经验**：提取结构体后，`cargo clippy` 不再产生 `too_many_arguments` 警告，且代码更易测试。但调用方需要临时的构造代码——这在 Rust 中略显冗长但可接受。

### 4. Clone 消除——std::mem::take 的适用场景

**问题**：`deserialize_command(&operation.params)` 内部调用 `serde_json::from_value(params.clone())`，额外克隆整个 JSON Value。

**方案**：
- 将 `task.operations.first()` 改为 `first_mut()`
- 用 `std::mem::take(&mut operation.params)` 零拷贝获取所有权
- 函数改为按值接收 `serde_json::Value`

**适用条件**：`std::mem::take` 仅当：
- 数据源是 `&mut` 引用
- 数据实现了 `Default`（`serde_json::Value` 的默认是 `Null`）
- 旧值不需要再使用（执行命令后 params 已消费完毕）

**经验**：热路径中每次克隆可节省约 50-200ns（取决于 JSON 大小）。虽然单个节省不大，但消除了「克隆后再被丢弃」的模式化浪费。

### 5. 命令层单元测试的切入方式

**问题**：`src-tauri/src/commands/` 下没有任何单元测试，核心编排逻辑缺乏覆盖。

**方案**：从纯函数切入——`error.rs` 的 `app_error_to_code()`、`mod.rs` 的 `ipc()`/`ipc_try()`、`task.rs` 的 `deserialize_params()`。使用代码库现有测试惯例（内联 `#[cfg(test)] mod tests`）。

**经验**：
- `IpcResult` 是枚举而非结构体（`IpcResult::Ok` / `IpcResult::Err`），测试时需用 `assert!(matches!(...))` 或解构
- `IpcErrorCode` 需要 `#[derive(PartialEq)]` 才能用于 `assert_eq!`
- 12 个测试覆盖了 16 种 `AppError→IpcErrorCode` 映射、4 种 `IpcResult` 状态、4 种 `deserialize_params` 场景

### 6. `@types/*` 在 package.json 中的分类

**问题**：`@types/markdown-it` 和 `@types/react-window` 放在 `dependencies` 而非 `devDependencies`。

**规则**：所有 `@types/*` 包应为 `devDependencies`，因为它们只在编译时需要，不影响运行时。Vite 构建时会自动树摇类型。

## 总结

Phase 41-42 的执行验证了「从宏观洞察→微观修复」的渐进式重构模式。9 项修复覆盖了 8 个领域，且均未造成功能回归。关键在于：
1. 选择边界清晰、风险可控的修复项先行
2. 每次变更必须有编译/测试验证
3. 知识沉淀同步进行，避免遗忘
