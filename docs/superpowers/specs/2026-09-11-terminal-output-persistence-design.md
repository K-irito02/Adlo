# 终端输出持久化设计规格

> **日期：** 2026-09-11
> **状态：** 草案
> **范围：** 终端标签输出内容的持久化存储、双端一致的存储抽象、会话生命周期管理

---

## 1. 问题陈述

### 1.1 当前问题

终端输出仅保存在内存 `Map`（`sessionOutputsRef`，每个会话 100KB 上限）。应用重启后，所有终端的历史输出丢失。当前 localStorage 方案容量受限（5MB），无法满足"无限存储"需求。

### 1.2 目标

| 目标 | 约束 |
|------|------|
| 无限存储 | 不受 localStorage 5MB 限制，容量仅受磁盘限制 |
| 性能无损 | 活跃会话的输出写入不能有可感知的延迟 |
| 彻底清理 | 用户关闭/清空终端时，彻底删除对应存储数据 |
| 双端一致 | Tauri 桌面模式和浏览器模式均可用（后端不同，接口统一） |

---

## 2. 架构设计

### 2.1 统一存储接口

```typescript
interface TerminalOutputStore {
  /** 保存会话输出（防抖调用，非实时） */
  save(sessionId: string, data: string): void;
  /** 加载会话输出（异步，切换标签时调用） */
  load(sessionId: string): Promise<string | null>;
  /** 删除会话输出（关闭标签时调用） */
  delete(sessionId: string): void;
}
```

### 2.2 双后端实现

```
┌─────────────────────────────────────────────────┐
│            useTerminalPtyLifecycle               │
│  ├─ 内存 Map<sessionId, string>（实时回放）      │
│  └─ 防抖 200ms → TerminalOutputStore.save()      │
├─────────────────────────────────────────────────┤
│          TerminalOutputStore（统一接口）           │
├──────────────────────┬──────────────────────────┤
│   Tauri 模式实现      │    浏览器模式实现          │
│   TauriTerminalStore  │    BrowserTerminalStore   │
│   ├─ Tauri Command    │    ├─ IndexedDB           │
│   └─ SQLite (WAL)     │    └─ 容量 ~60GB          │
└──────────────────────┴──────────────────────────┘
```

### 2.3 数据流

**写入流程：**

```
PTY 输出事件
  → 内存 Map 更新（即时，用于标签切换回放）
  → 防抖 200ms
  → store.save(sessionId, output)
      ├─ Tauri: invoke('save_terminal_output') → SQLite
      └─ 浏览器: IndexedDB transaction
```

**读取流程（切换标签）：**

```
用户切换标签
  → 先查内存 Map（命中则直接回放）
  → 未命中 → store.load(sessionId)
      ├─ Tauri: invoke('load_terminal_output') → SQLite
      └─ 浏览器: IndexedDB.get()
  → 写入内存 Map → 回放到 xterm.js
```

**删除流程：**

```
用户关闭标签 / 清空终端
  → store.delete(sessionId)
      ├─ Tauri: invoke('delete_terminal_output') → SQLite DELETE
      └─ 浏览器: IndexedDB.delete()
  → 内存 Map.delete(sessionId)
```

### 2.4 Tauri 后端：SQLite

复用现有 `adl-storage` crate（r2d2 连接池 + WAL 模式）。

**新增 SQLite 表：**

```sql
CREATE TABLE terminal_output (
  session_id TEXT PRIMARY KEY,
  output     BLOB NOT NULL,
  byte_size  INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**新增 Tauri Command：**

| Command | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `save_terminal_output` | `{ session_id: string, output: string }` | `Result<()>` | UPSERT 写入 |
| `load_terminal_output` | `{ session_id: string }` | `Result<Option<string>>` | 读取输出 |
| `delete_terminal_output` | `{ session_id: string }` | `Result<()>` | 删除输出 |

**写入策略：** UPSERT（`INSERT OR REPLACE`），单次写入完整输出。防抖 200ms 后调用，频率可控。

### 2.5 浏览器后端：IndexedDB

**数据库结构：**

```
Database: adl-terminal
  ObjectStore: "outputs"
    Key: session_id (string)
    Value: { output: string, byteSize: number, updatedAt: number }
```

**容量：** Chromium ~60GB，远超需求。

**写入策略：** `IDBObjectStore.put()`，异步事务。防抖 200ms 后调用。

**初始化：** 在 `TerminalOutputStore` 构造时打开数据库，复用连接。

### 2.6 内存缓冲策略

| 参数 | 值 | 说明 |
|------|-----|------|
| 单会话内存上限 | 100KB | 超出截断尾部（保留最新输出） |
| 防抖间隔 | 200ms | 多次输出合并为一次持久化写入 |
| 持久化存储上限 | 无硬限 | SQLite/IndexedDB 自行管理，磁盘满时写入失败不影响运行时 |

---

## 3. 会话生命周期

| 事件 | 操作 |
|------|------|
| **创建标签** | 内存 Map 新增空条目；不写持久化 |
| **收到 PTY 输出** | 更新内存 Map → 防抖写入持久化 |
| **切换标签** | 从内存 Map 或持久化存储加载 → 回放到 xterm.js |
| **会话终止（terminated）** | 仅更新标签状态；**保留输出**供用户回看 |
| **关闭标签** | 从持久化存储删除 → 从内存 Map 删除 |
| **清空终端** | 同关闭标签 |
| **应用重启** | 内存 Map 为空；首次切换标签时从持久化存储懒加载 |

---

## 4. 错误处理

| 场景 | 处理 |
|------|------|
| SQLite 写入失败 | `console.warn` 记录；内存 Map 不受影响，运行时功能正常 |
| IndexedDB 写入失败 | 同上 |
| 持久化存储读取失败 | 返回 `null`，标签显示为空（新会话状态） |
| 磁盘满 | 写入失败被 catch，不影响终端使用；日志记录 |
| 数据库未初始化 | 降级为纯内存模式（不持久化） |

---

## 5. 测试策略

| 层级 | 测试内容 |
|------|---------|
| 单元测试 | `TerminalOutputStore` 接口的两种实现：save/load/delete 逻辑 |
| 集成测试 | `useTerminalPtyLifecycle` 钩子：输出累积、防抖写入、标签切换回放、关闭清理 |
| E2E 测试 | 创建终端 → 输入命令 → 关闭应用 → 重启 → 切换标签 → 验证输出恢复 |

---

## 6. 双端一致性说明

本功能在两种模式下**功能一致**（输出持久化、标签切换回放、关闭清理），但**存储后端不同**：

| 模式 | 存储后端 | 接口 | 实现 |
|------|---------|------|------|
| Tauri 桌面 | SQLite (rusqlite) | `TerminalOutputStore` | `TauriTerminalStore` |
| 浏览器 | IndexedDB | `TerminalOutputStore` | `BrowserTerminalStore` |

这是"双端一致性"定义的合理扩展：**功能行为一致，实现策略可因环境而异**。详见 `docs/development/project-engineering-constraints.md` 双端一致性约束的更新。

---

## 7. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `frontend/src/app/features/terminal/terminalOutputStore.ts` | 新建 | `TerminalOutputStore` 接口 + `BrowserTerminalStore` 实现 |
| `frontend/src/app/features/terminal/terminalOutputStore.tauri.ts` | 新建 | `TauriTerminalStore` 实现（Tauri Command 调用） |
| `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts` | 修改 | 替换 localStorage 方案为 `TerminalOutputStore` |
| `crates/storage/src/entity_table.rs` | 修改 | 新增 `terminal_output` 表定义 |
| `crates/migration/src/lib.rs` | 修改 | 新增迁移版本 |
| `crates/server/src/commands/terminal.rs` | 新建 | 3 个 Tauri Command 实现 |
| `ai-digital-life/src-tauri/capabilities/*.json` | 修改 | 登记新 Command 权限 |
| `frontend/src/shared/ipc/pty.ts` | 修改 | 新增 `save/load/delete` bridge 方法 |
| `frontend/src/mock/mock-terminal.ts` | 修改 | 新增 mock 实现 |
| `frontend/src/shared/preview-bridge/` | 修改 | 新增 preview 实现 |
| 相关测试文件 | 新建/修改 | 单元测试 + 集成测试 |
