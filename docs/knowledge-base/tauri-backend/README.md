# Tauri Backend

Lessons learned from Tauri backend development and synchronization fixes.

## Files

- [branch-graph-lane-algorithm.md](./branch-graph-lane-algorithm.md) — Branch graph lane algorithm implementation
- [tauri-sync-command-blocking-2026-07-14.md](./tauri-sync-command-blocking-2026-07-14.md) — Fix for Tauri sync command blocking issue
- [serde-json-null-vs-absent-2026-08-06.md](./serde-json-null-vs-absent-2026-08-06.md) — serde 区分 JSON null 与字段缺省（`Option<Option<T>>` 陷阱）：`deserialize_with` 三态方案 + 往返测试必要性 + ts-rs 兼容
- [keyring-v3-no-default-backend-2026-08-07.md](./keyring-v3-no-default-backend-2026-08-07.md) — keyring v3 无默认后端 → 凭据静默不持久化（mock store）：按平台启用后端 + 可用性探测兜底（OnceLock 进程级固化）+ 跨进程持久化回归测试 + spawn_blocking 读凭据
- [third-party-api-casing-and-preview-parity-2026-08-07.md](./third-party-api-casing-and-preview-parity-2026-08-07.md) — 第三方 API 响应字段大小写（Google camelCase serde）+ 浏览器 preview 双端一致：fetchProviderModelsLive 按 provider 镜像 Tauri 适配器鉴权/解析/成功判据
- [dsh-port-reclaim-and-process-kill-2026-09-06.md](./dsh-port-reclaim-and-process-kill-2026-09-06.md) — 托管 Web 应用固定端口 + 残留进程释放：netstat 精确解析/PID 去重/kill 失败不中断/端口轮询判空闲/独立 start-lock + IPC 结构三桥同步
- [dsh-authenticated-url-and-version-catalog-2026-10-19.md](./dsh-authenticated-url-and-version-catalog-2026-10-19.md) — dsh 0.2.x 一次性 token 认证：stdout authenticated URL 捕获 + 401 指纹复用判定 + token 日志脱敏 + dist-tag 可能指向 rc（升级取正式版桶）+ pwsh 快照管线 GBK 解码坑
- [storage-status-ui-thread-hang-2026-10-20.md](./storage-status-ui-thread-hang-2026-10-20.md) — 设置面板打开即卡死：storage 同步命令在 UI 线程遍历 6 万文件（cdb 行号定位）+ 诊断心跳重 arm 防抖致零落盘
- [dsh-version-provenance-and-pending-switch-2026-10-20.md](./dsh-version-provenance-and-pending-switch-2026-10-20.md) — dsh 版本显示溯源（无后缀 shim 的 `.cmd` 回退须探测/拉起同口径；运行中版本只认 spawn 登记）+ 破坏性来源切换的 pending/启动兑现模式 + 一次性 token 进持久化的一律剥离
- [dsh-version-task-cancel-and-restart-ensure-2026-10-26.md](./dsh-version-task-cancel-and-restart-ensure-2026-10-26.md) — 同步全树 walk 饿死取消检查（搬 spawn_blocking + 独立快检分支 + 自适应节流；junction 需查 reparse 属性）+ `run_restart` 改“确保运行”语义 + `syncDshTab` 先开后关防中心空态补 launcher
