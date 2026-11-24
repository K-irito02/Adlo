# terminal-path · R2 rev3 审查报告

## 范围

- 快照：rev3（base `595216f1f`），manifest `manifest-rev3.md`，本 scope owner 的两个文件：
  - `adlo/crates/pty/src/managed_bins.rs`（`terminal_path_from` + 8 个用例）
  - `adlo/crates/pty/src/rust_pty_impl.rs`（`terminal_env` 层 Windows 回归用例）
- 只读上下文：两个文件全文、`crates/server/src/handlers/harness.rs`（`set_managed_state` 唯一生产调用点，196-242 行）、`crates/server/src/env_path.rs`（空条目/失败回退语义对照）、R1 rev1 / rev2 两份本 scope 报告、rev2 快照（判定本轮 delta）。
- **本轮 delta = 0**：两个文件的 rev3 快照与 rev2 快照逐字一致（blob 索引同为 `4d05ae6c7..b6df23095` / `ff22f98b2..b932621e2`），主代理在 rev3 未再触碰 terminal-path。因此 R2 的实质是「同一份已修代码按 R2 视角（死代码 / 冗余守卫 / 根因修后多余防御 / 应删降级的诊断日志）再复核一遍」，不重复 R1 的正确性论证。
- 只读约束遵守：未运行 `git diff/log/show`，未修改源码/配置，未运行任何测试（结论来自读码 + 生产调用点追踪 + 删除性推演）。未启动 dev server / 浏览器，无端口占用；未执行 `check:review` / `check:changed`（由主代理执行）。

## 上轮问题关闭情况

R1 的三条 low（rev1 提出、rev2 确认关闭）在 rev3 当前源码中仍为关闭状态，且 rev2→rev3 零 delta，不存在回退：

- **F1（断言消息承诺「前置」但只断言「包含」）— 已关闭**：`rust_pty_impl.rs:245-249` 现为
  `assert_eq!(std::env::split_paths(path).next().as_deref(), Some(Path::new(r"C:\managed\shim")), "managed dir must lead PATH: {text}")`；消息与断言同一事实。
- **F2（宿主 PATH 条目数写成硬断言）— 已关闭**：`rust_pty_impl.rs:237-240` 已改为 `if count <= 1 { eprintln!("skip: ..."); return; }`，环境前置条件不再让门禁假红。
- **F3（用例名承诺 `None`，实际只传 `Some(empty)`）— 已关闭**：`managed_bins.rs:198-206` 同时调用 `Some(&OsString::new())` 与 `None` 并 `assert_eq!(from_none, from_empty)`，`None` + 非空 dirs 的成功分支首次被锁定。

R1 rev2 结论为「本轮零问题」，本轮按 R2 视角复核后维持该结论（见下）。

## 新增发现

无。

按 R2 四项逐条核对（均不成立，记录推理以供复核）：

1. **死代码**：本轮 diff 新增的只有 `terminal_path_from` 的三段守卫、doc 注释与 8 个用例，全部有生产或测试消费方——`terminal_path_from` 由 `rust_pty_impl.rs:36` 调用；`tracing::warn!`/`eprintln!` 各自在失败分支与测试 skip 分支可达；无新增 `pub`、无新增私有辅助、无被替换后遗留的孤儿函数（旧 `parts.push(base.clone())` 与 `unwrap_or_else(|_| OsString::new())` 已整段删除，无残留引用）。
2. **冗余守卫**：`managed_bins.rs:57-59` 的 `dirs.is_empty()` 早退**不是**冗余——`managed_bins.rs:134` 的既有断言要求「无登记 + 非空继承值必须返回 `None`」，删掉它会让该用例变红并改变「未登记不改环境」的契约；`managed_bins.rs:65-67` 的 `parts.is_empty()` 与 `dirs` 空条目过滤的共同唯一可达输入是「全空 dirs」，属防御性保留（见「记录不修」第 1 条）。
3. **根因修后多余的防御**：根因是「整条继承 PATH 当单元素交给 `join_paths`」，修复本体是 `split_paths`→`join_paths`；错误回退 `inherited.cloned().filter(!is_empty)`（`managed_bins.rs:70-77`）不是多余防御，它是替代旧 `unwrap_or_else(|_| OsString::new())` 的唯一手段——去掉即在 join 失败时产出空 PATH（比缺托管目录严重）。空条目过滤与 `env_path.rs:98-102` 的既有语义一致，非本轮凭空添加。
4. **应删/降级的诊断日志**：本轮 diff 内只有 `managed_bins.rs:71-74` 一条 `tracing::warn!`（真实 join 失败，每次 PTY 创建至多一条，属生产 warn 级，不该降级也不该删）与 `rust_pty_impl.rs:238` 一条 `#[cfg(test)]` 内的 `eprintln!`（与 `crates/pty/tests/windows_compat.rs` 既有 skip 写法一致，不落生产）。`rust_pty_impl.rs:53-57` 的 `tracing::debug!` 是上下文行（非本轮新增），且是正常的调试级日志。

## 记录不修

1. **`dirs` 空条目过滤 + `parts.is_empty()` 双层防御在生产的不可达性**（`managed_bins.rs:60-67`）：生产唯一调用点 `harness.rs:196-218` 的 `dirs` 只来自 `bin_dir_for(...)` 与 `harness_root.parent().join("managed/shim")`，二者都不可能产出空 `PathBuf`，因此这两行只服务于合成输入的用例 `empty_inputs_do_not_produce_an_empty_path`（`managed_bins.rs:208-214`）。删掉两者并同步删该用例可少 8 行且零行为变化；保留的代价也仅是两行判断，且 doc 注释已把它写成契约。rev1/rev2 已按「风格/可读性」记录，本轮按「不为纯粹的风格收敛再开一个 rev」维持保留。若后续统一收紧 `adl-pty` 输入契约，可连同用例一次删除。
2. **单条目宿主上 `terminal_env_path_stays_resolvable_for_cmd` 空转**（`rust_pty_impl.rs:237-240`）：skip 生效时该层不验证任何契约，退化由 `managed_bins` 纯函数用例兜底。这是 rev1 F2 的既定取舍（环境前置条件不该让门禁假红），不再另加环境无关构造入口（`terminal_env` 只读 `std::env::vars_os()`，要构造需改生产签名）。
3. **导出面**：`terminal_path_from` / `managed_bin_dirs` / `managed_env` 为 `pub` 但无跨 crate 消费方（`managed_bin_dirs`/`managed_env` 自注「调试/测试用」），按 §5.6 应为 `pub(crate)`；签名属快照上下文行，预存问题，不在本轮扩大改动面。
4. **预存用例措辞瑕疵**（非本轮 diff 行）：`managed_bins.rs:127-130` 的 `text.starts_with(&format!("/managed/a{}", MAIN_SEPARATOR)) || text.starts_with("/managed/a")` 中第一分支在 Windows 上恒不成立、第二分支恒覆盖，实际等价于单条 `starts_with("/managed/a")`。属既有测试的冗余表达，本轮不修；若日后收紧测试再一并简化。
5. **与 `env_path.rs::merge_path` 的合并逻辑重复**（丢空条目、失败保留原 PATH 各写一遍）：`adl-pty` / `adl-server` 分层不同，共享需再引 crate；doc 注释只声明了这两条一致性（已核对 `env_path.rs:93,98-102` 属实），未过度承诺。
6. **失败态每条 PTY 记一条 warn**（`managed_bins.rs:71-74`）：失败态下的合理告警，一次会话一条，非日志洪水，保留。
7. 进度文件 / 架构文档的事实与措辞同步：按简报 §2 归 P5。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题
- R1 rev1 的 F1/F2/F3 保持关闭；rev2→rev3 对 terminal-path 零改动，R2 视角（死代码 / 冗余守卫 / 多余防御 / 诊断日志）未发现需修复项。
