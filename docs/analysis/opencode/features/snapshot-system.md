# Snapshot 快照系统

> 源码：`core/src/snapshot.ts`（~266 行）、`opencode/src/snapshot/`

## 设计核心

OpenCode 的快照系统**完全基于 Git** 实现。每个快照对应一个独立的 Git tree hash，存储在项目独立的 gitdir 中。

```
存储路径:
  Global.Path/data/snapshot/<project_id>/<hash>/

自动清理:
  - prune 周期: 7 天
  - 大小限制: 2MB per project
```

## 核心服务接口

```ts
Snapshot.Interface = {
  capture(): Effect<Snapshot.ID>                    // 创建快照 → 返回 Git tree hash
  files(input: CompareInput): Effect<FileList>       // 对比两个快照的文件列表
  diff(input: DiffInput): Effect<string>              // 对比两个快照的 unified diff
  preview(input: PreviewInput): Effect<string>        // 预览恢复效果（dry-run）
  restore(input: RestoreInput): Effect<void>          // 恢复快照（部分文件）
  checkout(id: Snapshot.ID): Effect<void>             // 完全恢复到指定快照
}
```

## 关键类型

```ts
Snapshot.ID = string  // Git tree hash（Branded）

Snapshot.Error = TaggedError<{
  operation: "capture" | "files" | "diff" | "preview" | "restore"
  message: string
  cause?: unknown
}>

CompareInput = { from: Snapshot.ID, to: Snapshot.ID }
DiffInput    = { from: Snapshot.ID, to: Snapshot.ID, context?: number, paths?: string[] }
RestoreInput = { files: Map<RelativePath, Snapshot.ID> }
PreviewInput = RestoreInput & { context?: number }
```

## 快照生命周期

```
会话开始 → capture() → snapshot_1 (base)
  │
Agent 修改文件 (edit/write/bash)
  │
capture() → snapshot_2 (after edits)
  │
diff(snapshot_1, snapshot_2) → 显示所有变更
  │
用户执行 revert
  │
checkout(snapshot_1) → 恢复到初始状态
  │
自动 prune (7 天后或超过 2MB)
```

## 独立 Gitdir 设计

```
project_root/.git (用户的 Git 仓库)
  ← 完全独立，不受影响

Global.Path/data/snapshot/<project_id>/<hash>/
  ← OpenCode 的快照存储
  ← 使用独立的 GIT_DIR 环境变量
```

## LegacyFileDiff 兼容

```ts
// core/src/snapshot.ts
LegacyFileDiff = {
  // 旧版 session 的 diff 格式兼容
  // 用于迁移老 session 数据到新 snapshot 系统
}
```

## Revert 流程

```
session.revert(sessionID, target)
  │
  ▼
revert.ts (core + opencode)
  ├── RevertState: "previous" | "initial" | specific_hash
  │
  ▼
snapshot.restore() / snapshot.checkout()
  │
  ▼
记录 revert 操作 (支持 unrevert)
  │
  ▼
UI 显示 RevertButton
```

## 关键设计要点

1. **零依赖快照**：完全依赖 Git（无外部数据库），每个快照 = Git tree
2. **自动清理**：7 天 + 2MB 双限制，自动 prune 旧快照
3. **部分恢复**：支持恢复单个文件而非整个工作区
4. **Diff 预览**：restore 前可 dry-run 查看变更
5. **禁用开关**：可通过配置完全禁用 snapshot 功能
