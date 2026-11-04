# Tauri dev 模式下 Windows 残留进程锁定 exe 导致 Rust 修改不生效

## 问题现象

`pnpm run dev:tauri` 有时不生效修改的 Rust 代码，需先手动 `cargo build` 才能看到新代码。

## 根因

`dev:tauri` → `run-project-surface.mjs` → `cargo tauri dev` → tauri-cli 内部执行 `cargo run --no-default-features`。

Windows 下上一 dev 会话的 `adlo.exe` 进程残留（终端被强制关闭等），独占锁住 `target/debug/adlo.exe`。新的 `cargo run` 重链接时无法覆盖被占用的 exe → 链接失败 → 旧窗口仍显示旧代码。

- 已实测：残留进程运行期间 exe 被独占锁定（`fs.openSync` Open ReadWrite 抛 "used by another process"）；进程停止后 exe 恢复可写
- 参考上游：tauri#12429（Windows 下 watcher 重建前未杀 app 进程）

## 修复方案（`adlo/scripts/run-project-surface.mjs`）

1. `killProcessesByName(imageName, exePath)` 导出函数：
   - win32：PowerShell `Get-Process -Name <去.exe后缀> | Where-Object {$_.Path -eq <dev exe 精确路径>} | Stop-Process -Force`，仅杀路径匹配实例，避免误伤同名的 release/installed 构建
   - **实测陷阱**：`Get-Process -Name` 拒绝 `.exe` 后缀，必须先剥离
   - 其余平台：`pkill -x <name>`（跨平台完整实现）
2. `main()` 中 `tauri`/`both` 模式在 vite 就绪、`cargo tauri dev` 前，先 `isExeLocked(appDevExePath)` 探测锁，仅锁定时才 kill，随后 `waitForUnlock` 短轮询（50ms / 1.5s）确认锁释放（未释放则醒目警告但 fail-soft 继续）
3. 将顶层 `main()` 调用包进 `isMain` 守卫（`import.meta.url === pathToFileURL(process.argv[1])` 归一化比较），使脚本可被测试导入而不误启动应用
4. PowerShell spawn 用 `withTimeout(label, run, ms)` 竞速清理子进程（try/catch + `isTimedOut()` 谓词 + 超时 kill + fail-soft）

## 红绿测试方法（仓库外自包含脚本）

`scripts/` 无测试框架，用仓库外 Node 脚本 `adl-stale-lock-test.mjs` 实证机制：
- PASS 基线：无实例运行时真实 exe 可写
- PASS RED：运行中的实例独占锁定其镜像文件（写打开失败）→ 即 cargo 无法重链接的机制
- PASS GREEN：`killProcessesByName` 终止残留进程并释放锁 → 重链接可成功

## 经验教训

1. **Windows 下"修改不生效"先怀疑 exe 文件锁**：`cargo run` 重链接失败是"旧代码仍显示"的高频根因，残留进程来自上一 dev 会话被强制关闭（句柄未释放）。
2. **按名全杀会误伤**：`taskkill /F /IM <name>` 会杀掉同名的 release/installed 构建，必须按**精确路径**匹配（`Get-Process` 的 `$_.Path`）。
3. **kill 后锁不一定立即释放**：进程退出 ≠ 句柄已释放，需轮询验证锁状态（`waitForUnlock`），仍锁定则警告但不阻塞启动（fail-soft）。
4. **启动脚本要保持可测试性**：顶层副作用必须包进 `isMain` 守卫 + `export` 纯函数，才能用 `import()` 导入做红绿测试。
5. **PowerShell 管道参数陷阱**：`Get-Process -Name` 不接受 `.exe` 后缀；路径比较前规范化（`realpathSync`），避免 8.3 短路径/符号链接静默失效。