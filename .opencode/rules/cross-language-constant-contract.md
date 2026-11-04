---
description: 跨语言常量契约：TS/Rust 双写常量必须两侧钉值测试 + 交叉引用注释，任一侧单独改动即失败
globs: adlo/frontend/src/shared/**,adlo/crates/**/constant*.rs,adlo/crates/**/config*.rs
alwaysApply: false
---

# 跨语言常量契约（Cross-Language Constant Contract）

## 规则

当同一个"产品决策数值"必须同时存在于 TypeScript 与 Rust 两侧（前端单一来源常量 + 后端钳制/校验常量）时，**禁止**只靠口头约定或单侧测试。必须同时满足：

1. **交叉引用注释**：两侧常量的 doc 注释互相注明对方文件路径与符号名，并写明"任一侧单独改动都会失败"。
2. **两侧钉值测试**：两侧各自有单测把字面值钉死（如 `assert_eq!(MAX_SEARCH_RESULTS, 200)` 与 `expect(SEARCH_PAGE_SIZE).toBe(200)`），且断言的是**字面值**而非另一侧常量（自引常量的断言没有跨语言约束力）。
3. **单一语义来源**：切片/归一化逻辑（如钳制区间、默认值）只实现一次并复用；确需各端实现时（如 Rust 与前端各一份），行为必须逐边界对齐并有测试覆盖（恰好取尽、越界、钳制上下界）。

## 已有实例

- 检索结果分页窗口：`adlo/frontend/src/shared/ipc/searchWindow.ts` 的 `SEARCH_PAGE_SIZE=200` / `SEARCH_MAX_RESULTS=5000` ↔ `adlo/crates/workspace/src/search.rs` 的 `MAX_SEARCH_RESULTS` / `MAX_SEARCH_RESULTS_UNLIMITED`。
  - 前端钉值：`frontend/src/shared/ipc/__tests__/searchWindow.test.ts`（`cross-language window contract`）。
  - 后端钉值：`crates/workspace/src/search.rs`（`search_window_tests::window_is_clamped_to_the_safety_valve`）。

## 为什么

双写常量是双端架构（Rust 服务端 + WebView 前端）的固有代价；没有钉值测试时，单侧改动会**静默漂移**（例如前端把安全阀调到 10000，后端仍钳到 5000，用户看到"显示全部"却只拿到 5000 且无任何报错）。钉值断言把"产品决策变更"变成"必须双侧同改的显式动作"。

## 反例（禁止）

- 在一侧断言 `expect(SEARCH_PAGE_SIZE).toBe(SEARCH_PAGE_SIZE)`（恒真，无约束力）。
- 只在一侧写注释说"与另一侧保持一致"但无测试。
- 为规避双写而把常量放进生成文件或运行时下发的配置（引入 IPC/启动顺序耦合，得不偿失）。
