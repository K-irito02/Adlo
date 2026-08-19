# Task 3 Fix 1 — 静默元数据部分提前返回修复报告

## 状态
DONE

## Commit
`cde32f8a` — `fix(browser): fire 1500ms partial pre-return when channel goes silent after partial meta`
（仅 `src-tauri/src/commands/browser.rs` 一个文件：+62 / -7）

## 问题（Important-1）
`poll_silent_meta` 中 "1500ms 部分提前返回" 的判定只出现在每个 `tokio::time::timeout` 结果的
`Ok(Some(...))` 分支内；`Err(_elapsed)`（本轮无数据）分支为空。

**后果**：部分元数据（仅标题或仅 favicon）到达一次后，若 channel 保持静默（不关闭、不再发数据），
循环会一直空转到外层 6s 总体超时才返回相同的部分结果——违反规格 "recorded partial + waited ≥ 1500ms →
立即返回当前部分结果"。数据相同，但延迟从 1.5s 恶化为 6s。

## 改动内容
1. **`poll_silent_meta` 的 `Err(_elapsed)` 分支**：新增与 `Ok(Some(...))` 分支一致的提前返回判定——
   若 `first_meta_at` 为 `Some` 且 `elapsed >= partial_ms`，立即 `return best_silent_meta(svc, url)`。
2. **抽取 `SilentPollDurations` 结构**（`round_ms` / `partial_ms`，`Default = {300ms, 1500ms}`）：
   供函数注入短时长以便单测快速、确定地驱动时序路径；`wait_for_silent_meta` 使用默认值，生产行为不变。
3. **未改动**：完整收敛（`silent_converged`）立即返回、`Ok(None)` 空回退、`best_silent_meta` 回退语义、
   外层 6s 总体超时（`SILENT_FETCH_TIMEOUT_MS`）。全程保持 `AppError` 处理、无 `unwrap()`（非测试代码）。

## 新增测试
`commands::browser::silent_meta_tests::partial_meta_pre_returns_even_when_channel_goes_silent`
- 复用现有 `empty_svc()`（真实 `PageMetaService` + `SiteMetaCacheStore`，隔离临时目录）。
- 发送一次仅标题（无 favicon）的部分元数据，随后保持 tx 存活（channel 静默但不关闭）。
- 注入 `round_ms=20 / partial_ms=100`，断言在 `elapsed < 1s` 内返回，且返回部分结果（title="部分标题"、
  favicon 空、source=COM）。
- 修复前该测试会等到 6s 总体超时 → 断言 `elapsed < 1s` 失败；修复后毫秒级通过。确定性、快速（0.13s 总量）。

## 验证输出
- `cargo check -p ai-digital-life` → ✅ Finished（0 warnings）
- `cargo clippy -p ai-digital-life --all-targets -- -D warnings` → ✅ Finished，无 lint 警告
- `cargo test -p ai-digital-life silent_meta_tests -- --nocapture` → **9 passed；0 failed**（含新增回归测试）
- `cargo fmt --all` → ✅ 无改动
- 备注：存在一条预存 `linker_messages` 编译 warning（bin 测试链接生成 .lib/.exp），与本次逻辑无关；
  crates/server `pty_ws` 已知环境类失败未被运行，不阻塞本次变更。

## 说明
报告文件自身未纳入任何 commit。