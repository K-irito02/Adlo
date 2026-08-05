# Tauri Backend

Lessons learned from Tauri backend development and synchronization fixes.

## Files

- [branch-graph-lane-algorithm.md](./branch-graph-lane-algorithm.md) — Branch graph lane algorithm implementation
- [tauri-sync-command-blocking-2026-07-14.md](./tauri-sync-command-blocking-2026-07-14.md) — Fix for Tauri sync command blocking issue
- [serde-json-null-vs-absent-2026-08-06.md](./serde-json-null-vs-absent-2026-08-06.md) — serde 区分 JSON null 与字段缺省（`Option<Option<T>>` 陷阱）：`deserialize_with` 三态方案 + 往返测试必要性 + ts-rs 兼容