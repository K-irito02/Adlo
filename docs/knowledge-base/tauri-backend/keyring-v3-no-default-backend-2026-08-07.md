# keyring v3 无默认后端：凭据静默不持久化 + 兜底探测 + spawn_blocking（2026-08-07）

## 问题

Tauri 桌面应用"保存 API 密钥后，重启即丢失"。排查发现密钥从未真正写入系统钥匙串。

## 根因（实证）

`keyring` v3.x **没有默认特性**（`[features] default` 为空）。依赖只声明
`features = ["crypto-rust"]` 时，不启用任何平台后端。此时 keyring 在
`src/lib.rs` 按平台 `cfg` 全部落到 **进程内存的 mock store**
（`CredentialPersistence::EntryOnly`）：

- `set_password` 进程内返回 `Ok`（写入内存）→ 前端显示"保存成功"；
- 重启后 `get_password` 返回 `NoEntry` → `has_key=false` → 密钥看似"消失"；
- `cmdkey`/Windows 凭据管理器无条目、加密文件兜底目录也不存在 → 证明走的是 mock。

## 修复

1. **按平台显式启用后端**（`crates/credential/Cargo.toml`，target 条件依赖）：
   - Windows：`keyring = { version = "3", features = ["crypto-rust", "windows-native"] }`
   - macOS：`apple-native`
   - Linux：`sync-secret-service`
2. **加密文件兜底要真正可触发**：三个平台的 `Entry::new` 都只是惰性校验、从不失败，
   所以"仅当 `Entry::new` 失败才降级"的兜底是死代码。改为在 `try_new` 里做
   **可用性探测**：`get_password()` 返回 `Ok` 或 `NoEntry` 视为可用（NoEntry 表示
   store 可达但条目不存在）；其它错误（无 D-Bus / 钥匙串锁定）→ 降级加密文件。
3. **回归测试跨进程验证持久化**：`credentials_persist_across_process_restart` 写凭据后
   用 `current_exe()` 起子进程（模拟重启）读回；mock store 下子进程读不到 → 测试失败。
   环境无可用凭据存储时打印诊断并跳过（不 panic），保证 CI 可跑。

## 教训

- 换第三方库先读 `[features] default`。keyring v3 移除了默认平台后端，必须显式开启。
- "写成功但重启丢失"优先怀疑存储层是否真的落盘（系统凭据管理器 / 文件），而非前端状态。
- 异步命令里做钥匙串/凭据读写必须 `tokio::task::spawn_blocking`（Windows CredRead、
  Linux D-Bus 都会阻塞 worker）；且不要在持有 registry/config 锁时做阻塞 I/O
  （先快照 owned 数据出锁，再在 blocking 线程里读凭据）。

## 相关

- 进度：`docs/root-cause-resolution/2026-08/progress-2026-08-06-225928.md`
- 同类：`tauri-sync-command-blocking-2026-07-14.md`（异步命令阻塞 I/O）
