# Tauri Backend

Lessons learned from Tauri backend development and synchronization fixes.

## Files

- [branch-graph-lane-algorithm.md](./branch-graph-lane-algorithm.md) — Branch graph lane algorithm implementation
- [tauri-sync-command-blocking-2026-07-14.md](./tauri-sync-command-blocking-2026-07-14.md) — Fix for Tauri sync command blocking issue
- [serde-json-null-vs-absent-2026-08-06.md](./serde-json-null-vs-absent-2026-08-06.md) — serde 区分 JSON null 与字段缺省（`Option<Option<T>>` 陷阱）：`deserialize_with` 三态方案 + 往返测试必要性 + ts-rs 兼容
- [keyring-v3-no-default-backend-2026-08-07.md](./keyring-v3-no-default-backend-2026-08-07.md) — keyring v3 无默认后端 → 凭据静默不持久化（mock store）：按平台启用后端 + 可用性探测兜底（OnceLock 进程级固化）+ 跨进程持久化回归测试 + spawn_blocking 读凭据
- [third-party-api-casing-and-preview-parity-2026-08-07.md](./third-party-api-casing-and-preview-parity-2026-08-07.md) — 第三方 API 响应字段大小写（Google camelCase serde）+ 浏览器 preview 双端一致：fetchProviderModelsLive 按 provider 镜像 Tauri 适配器鉴权/解析/成功判据
- [dsh-port-reclaim-and-process-kill-2026-09-06.md](./dsh-port-reclaim-and-process-kill-2026-09-06.md) — 托管 Web 应用固定端口 + 残留进程释放：netstat 精确解析/PID 去重/kill 失败不中断/端口轮询判空闲/独立 start-lock + IPC 结构三桥同步