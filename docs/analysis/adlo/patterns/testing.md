# 测试模式（索引）

> **体裁变更**：本文件原为实现快照，现已精简为索引。规范性约束以 `.agents/rules/` 为准。
> 源码路径：`adlo/`

## 阅读地图

| 想了解 | 去哪里 |
|--------|--------|
| 结束验收流程、强制红绿测试、测试材料管理 | `.agents/rules/mandatory-testing.md` |
| 测试/类型检查/合并前检查、重构门禁 | `.agents/rules/quality-gates.md` |
| 测试文件 `__tests__/` 同位组织 | `.agents/rules/frontend-test-tests-co-location.md` |
| 常用测试命令速查 | `.agents/rules/commands.md` |
| 当前测试计数与质量门禁状态 | `adlo/AGENTS.md` |

## 实现备注（快照摘录，细节以源码为准）

- 双层：前端 Vitest（`frontend/vitest.config.ts` 独立配置）+ Rust `cargo test`（源文件内联 `#[cfg(test)]` + `crates/*/tests/` 集成测试）。
- 前端 Mock 策略：不 mock 单个 IPC 调用，以 `mock-bridge.ts` 整体替换桥接层，返回 `IpcResult<T>`。
- 测试材料：以实际 TS 类型生成，覆盖常规/边界路径，禁裁剪字段简化逻辑。
- Rust：`cargo test --workspace` / `-p <crate>` / `--test <file>`；受影响测试优先；覆盖率仅参考，不设硬门禁。
