# terminal-path · R1 rev2 审查报告

## 范围

- 快照：`.review-diffs/` rev2（base `595216f1f`），manifest `manifest-rev2.md`，本 scope owner 的两个文件：
  - `adlo/crates/pty/src/managed_bins.rs`（`terminal_path_from` + 7 个用例）
  - `adlo/crates/pty/src/rust_pty_impl.rs`（`terminal_env` 层 Windows 回归用例）
- 上下文只读参考：`crates/pty/src/managed_bins.rs` 全文（`managed_state` / `set_managed_state` / `test_guard`）、`crates/pty/src/rust_pty_impl.rs`（`terminal_env` 调用点）、`crates/server/src/env_path.rs::merge_path`（空条目语义对照）、rev1/rev2 两份同文件快照（用于判定本轮 delta）、`.agents/rules/review-brief.md`、ADR-0005 / ADR-0011 / ADR-0012。
- 本轮定位：rev≥2 定向复核。**主表只收 rev1 主表 finding 的关闭判定 + rev2 修复引入的回归/契约错误**；更早 pre-existing 项见「记录不修」。
- 只读约束遵守：未运行 `git diff/log/show`，未修改源码/配置，**未运行任何测试**（结论全部来自读码 + 删除性推演）。未启动 dev server / 浏览器，无端口占用。
- 未执行 `check:review` / `check:changed`（由主代理执行）。

### rev1 → rev2 实际 delta（其余行与 rev1 逐字一致）

1. `managed_bins.rs::tests::no_inherited_path_keeps_only_managed_dirs`：新增 `from_none` 与 `assert_eq!(from_none, from_empty)`（F3 修复）。
2. `rust_pty_impl.rs::tests::terminal_env_path_stays_resolvable_for_cmd`：
   - 宿主 PATH 条目数的硬断言 → `if count <= 1 { eprintln!(...); return; }`（F2 修复）；
   - `assert!(text.contains(r"C:\managed\shim"), "managed dir must lead PATH")` → `assert_eq!(split_paths(path).next().as_deref(), Some(Path::new(r"C:\managed\shim")), ...)`（F1 修复）。
3. `terminal_path_from` 实现体、doc 注释、其余 6 个用例：**零改动**（rev1 已核，无回归）。

## 上轮问题关闭情况

### F1 [low] 断言消息承诺「前置」但只断言「包含」 — **已关闭**

- 现状（`adlo/crates/pty/src/rust_pty_impl.rs:245-249`）：
  `assert_eq!(std::env::split_paths(path).next().as_deref(), Some(std::path::Path::new(r"C:\managed\shim")), "managed dir must lead PATH: {text}")`。断言与消息现在同一事实：首条目必须是托管 shim。
- 删除性推演：把 `terminal_path_from` 变异为「托管目录追加到继承条目之后」→ `next()` 变成首个继承条目（宿主 PATH 非空时必然存在，F2 的 skip 只挡「单条目」而不是「空」），该断言变红。变异为「托管目录插到第 2 位」同样红。消息中的绝对断言（must lead）由该断言直接证明，§5.8 通过。
- 附带收益：`!text.contains('"')` 与顺序断言职责不再重叠（前者抓整体加引号，后者抓前置），两个变异各自会打红不同断言。

### F2 [low] 宿主 PATH 条目数写成硬断言 — **已关闭**

- 现状（`rust_pty_impl.rs:237-240`）：`if split_paths(&var_os("PATH").unwrap_or_default()).count() <= 1 { eprintln!("skip: host PATH has a single entry; ..."); return; }`。环境前置条件不再让门禁假红；`crates/pty/tests/windows_compat.rs:49,80` 已有同款 `eprintln!` 跳过写法，风格一致；`eprintln!` 位于 `#[cfg(test)]` 模块内，不触犯 `check-source-hygiene`（非生产日志遗留）。
- 顺序正确：skip 判断在执行 `terminal_env` / 复位注册表**之后**、`expect("PATH injected")` **之前**，因此「托管目录完全未注入」这一更严重回归仍会在多条目宿主上打红，单条目宿主则回落为 `managed_bins` 纯函数层的覆盖。
- skip 注释的绝对断言「单条目宿主 PATH 无法复现整体加引号的失败」可证：Windows `join_paths` 只对「元素内含 `;`（或以 `\` 结尾）」的元素加引号，而 `split_paths` 的产物元素内不含 `;`，故单条目无法构成「含 `;` 的元素」→ 断言成立。

### F3 [low] 用例名承诺 `None`，实际只传 `Some(empty)` — **已关闭**

- 现状（`managed_bins.rs:198-206`）：`from_empty = terminal_path_from(&dirs, Some(&OsString::new()))`、`from_none = terminal_path_from(&dirs, None)`，先 `assert_eq!(from_none, from_empty)`，再 `assert_eq!(split_paths(&from_empty).collect::<Vec<PathBuf>>(), dirs)`。标题（no inherited path）与两个入参一致，`None` + 非空 `dirs` 的成功分支首次被断言。
- 删除性推演：把 `None` 分支变异为返回 `None`（或跳过托管目录）→ `.expect("path")` panic 红；变异为「`None` 时不过滤空目录」→ `parts == dirs` 红。旧实现（`Some(empty)` 被跳过、`None` 直接拼装）下 `assert_eq!(from_none, from_empty)` 仍绿，但 `parts == dirs` 已足以锁定成功分支内容，用例不再是「标题承诺 A、只断言 B」。

**结论：rev1 三条 low 全部关闭，无一条以「改标题」敷衍，均为断言侧实质收紧。**

## 新增发现

本轮修复未引入回归，无新增发现。

已核但**不构成** finding 的点（记录推理过程）：

- `no_inherited_path_keeps_only_managed_dirs` 中 `parts`（`Vec<PathBuf>`）与 `dirs`（`Vec<PathBuf>`）类型一致，`assert_eq!` 编译无歧义；`dirs` 为最后使用，无移动后使用问题。
- `terminal_env_path_stays_resolvable_for_cmd` 的 `key.eq_ignore_ascii_case("PATH")` 依赖 `OsStr::eq_ignore_ascii_case`（1.53 起稳定），与同文件生产代码 `terminal_env` 第 29 行的既有写法同形，无新增 crate/feature 依赖。
- `use std::path::PathBuf;` 在非 Windows 编译时只被 `#[cfg(windows)]` 用例使用，理论上是 `unused_imports` 隐患；但该文件第 6-8 行已无条件 import `WindowsPtyChild` / `WindowsPtyMaster`，crate 本身仅 Windows 可编译，且仓库无 .github/workflows CI 矩阵，故非实际风险（不记为需修复）。
- §4.1 异步/落盘专项不适用：本 scope 无 `await`、无写盘、无缓存基线；`set_managed_state` 的测试写入仍由 `test_guard()` 串行化，且复位在断言前完成，失败路径不会把错配状态留给同进程其它用例。

## 记录不修

- **单条目宿主上 `terminal_env` 层用例退化为空转**：skip 生效时该用例不验证任何契约（连同「托管目录未注入」也只由 `managed_bins` 层兜底）。这是 rev1 F2 明确建议的取舍（环境前置条件不该让门禁假红），且真正的 split/join 契约已在 `managed_bins` 纯函数层全覆盖；不再另加环境无关的构造入口（`terminal_env` 只读 `std::env::vars_os()`，要构造需改生产签名，得不偿失）。
- **`terminal_path_from` / `managed_bin_dirs` / `managed_env` 为 `pub` 但无跨 crate 消费方**（§5.6 应为 `pub(crate)`）：签名在本轮快照中属上下文行，预存问题，不在本轮 diff 引入；留待统一收紧导出面。
- **与 `env_path.rs::merge_path` 的合并逻辑重复**（丢空条目、失败保留原 PATH 各写一遍；`env_path` 另有 `push_unique` 去重与 stale 摘除）：`adl-pty` / `adl-server` 分层不同，共享需再引 crate，本轮按最小改动保留；doc 注释只声明了这两条一致性，未过度承诺。已复核 `env_path.rs:93,98-100` 确实同样丢弃空目录与空条目，注释属实。
- **继承 PATH 已被引号污染时不自愈**（从修复前的破终端启动的旧会话）：既有状态而非本轮回归；属产品决策，建议 P5 在进度文件补一句「从干净终端重启 Adlo 后生效」。
- **`dirs.is_empty()` 与 `parts.is_empty()` 双重守卫**：纯风格，前者保留「未登记 ≠ 登记了空目录」的可读性。
- `docs/root-cause-to-close/2026-11/progress-2026-11-24-214722.md` 的事实/措辞同步：按简报 §2 归 P5，不列主表。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题
- rev1 的 F1/F2/F3 全部关闭；实现本体（split/join、空条目丢弃、失败回退、doc 注释、跨平台门控、ADR 一致）与 rev1 结论一致，仍为零问题。
