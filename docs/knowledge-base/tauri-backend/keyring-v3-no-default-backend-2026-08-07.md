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

## 后续演进（同日补充）

探测兜底方案在收尾复审中进一步收敛为**进程级一次性探测 + 缓存**：

- **问题**：`try_new` 每次 `CredentialStore::new` 都执行一次阻塞 `get_password()` 探测；
  若 keychain 可用性在进程内翻转（D-Bus 拉起、钥匙串锁定/解锁），可能写入 keyring 却从加密
  文件读取（或反之），表现为"密钥偶发丢失"（flip-flop）。
- **修复**：`KEYRING_USABLE: OnceLock<bool>` 在进程首次构造时探测一次并固化后端选择；
  探测身份用固定 `adlo-probe`/`availability`（只读、无残留、三平台均映射
  `NoEntry` 为可用）。每次构造不再重复阻塞探测。
- **取舍（已文档化）**：决策只对当前进程有效——跨启动后端漂移仍在（进程 A 探测失败写文件、
  进程 B 探测成功读 keyring 时看不到）。完整根治需读端双后端兜底，列为未来工作。
- **健壮性**：探测包 `std::panic::catch_unwind`（仅守护 unwind 构建；release `panic=abort`
  下 abort 视为致命，探测本身无 unwrap/expect 故风险极低）；keyring 不可用与探测 panic
  分别告警，均为进程级一次。
- **错误分类**：加密文件后端的环境类 IO 失败（`create_dir_all`/`fs::write`/读/删）归
  `AppError::Io`，加密/格式错误保持 `AppError::Storage`；跨进程持久化测试据此只在
  "文件后端 + Io 错误"时跳过，keyring 写入失败或文件加密失败仍 panic（不掩盖真实回归）。

## 相关

- 进度：`docs/root-cause-resolution/2026-08/progress-2026-08-06-225928.md`、`progress-2026-08-07-100000.md`
- 同类：`tauri-sync-command-blocking-2026-07-14.md`（异步命令阻塞 I/O）
