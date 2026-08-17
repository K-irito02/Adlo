# 评审报告：Task A — Rust Browser Crate 变更

## 1. 变更摘要

本次变更涉及 `crates/browser/` 下的核心模块，覆盖 5 个任务项：

| 文件 | 变更内容 | 涉及任务 |
|------|----------|----------|
| `page_meta_service.rs` | mark_failure 首败 off-by-one 修复、预热并发优化、InFlightGuard RAII 保护、upsert 日志记录 | ③⑦⑬ab |
| `site_meta_cache.rs` | schema 版本检查与迁移、upsert 事务批量写入 | ⑫ |
| `browser_webview.rs` | set_site_meta_cache 重建 service、WebView2 事件注册 | ② |
| `Cargo.toml` | 依赖调整 | ⑦ |

## 2. 各任务项修复评估

### ② set_site_meta_cache 不重建 service
- **实现**：在 `browser_webview.rs` 中，`set_site_meta_cache` 方法在更换 store 后重建了 `page_meta_service`，确保 service 指向新存储库。
- **评估**：正确实现。消除了使用旧缓存的问题。

### ③ mark_failure 首败 off-by-one
- **实现**：修改了 `mark_failure` 中的 `fail_count` 自增逻辑，创建时 `fail_count: 0`，首次失败自增后为 1，退避时间正确计算为 `5min × 2^1 = 10min`，与 JS 端一致。
- **评估**：正确实现。同时消除了 `next_retry_at` 初始值立即被覆盖的死代码。

### ⑦ 预热并发与镜像传播
- **实现**：`warmup` 方法从串行改为并发，`FuturesUnordered` + `buffer_unordered(8)` 限制并发上限为 8；处理全部 retry_due URL 而非仅前 8 个。
- **评估**：正确实现，显著提升了预热吞吐量。

### ⑫ SQLite 旧表缺列默认处理
- **实现**：`site_meta_cache.rs` 添加了 schema 版本检查，校验 DB 列完整性，不匹配时重建表。
- **评估**：正确实现，避免因旧表列缺失导致读写失败。

### ⑬ 健壮性
- **实现**：`InFlightGuard` RAII 结构体防止 fetcher panic 导致 `in_flight` 条目泄漏；`write_success` 中 `upsert` 失败记录 `tracing::warn!` 日志，不再静默吞错。
- **评估**：正确实现。`InFlightGuard` 确保了即使 `fetch` panic 也能清理 `in_flight` 状态并通知等待者。

## 3. Rust 编码规范符合性

| 规范 | 状态 | 说明 |
|------|------|------|
| 禁止 `unwrap()` | ✅ | 所有错误处理使用 `?` 或模式匹配 |
| `thiserror` + `AppError` | ✅ | 统一使用 `AppError` 错误类型 |
| rustfmt 格式化 | ✅ | 代码格式规范 |
| 模块化组织 | ✅ | 按功能拆分清晰 |

## 4. 潜在问题与风险

- **并发预热**：`buffer_unordered(8)` 的并发数合理，但需注意大量 URL 同时预热时的网络 I/O 压力。建议在部署时根据实际网络环境调整并发数。
- **Schema 迁移**：重建表策略在未发布产品阶段可接受，但若未来有用户数据，需改为更温和的 ALTER TABLE 迁移方案。
- **InFlightGuard**：RAII 实现正确，但需确保 `Drop` 路径中不会 panic（当前实现安全）。

## 5. 改进建议

- 预热并发数可通过配置暴露，而非硬编码为 8。
- 可考虑添加预热进度的 metrics 监控。

## 6. 评审结论

**通过** — 所有修复正确实现，符合 Rust 编码规范，无重大逻辑错误或安全问题。