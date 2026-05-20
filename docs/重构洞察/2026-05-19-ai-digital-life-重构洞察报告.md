# AI Digital Life 重构洞察报告

> 生成时间: 2026-05-19
> 项目路径: e:\Programs\Obsidian\notes\ai-digital-life

## 一、架构设计评估

### 1.1 整体架构优势 ✅

| 维度 | 评价 |
|------|------|
| **Rust Workspace 结构** | 良好的模块化拆分（19个独立crate），kernel定义契约类型，storage/migration分离，关注点分离清晰 |
| **前端分层** | 组件/hooks/regions/utils分层合理，桥接层设计（tauri-bridge/preview-bridge/mock-bridge）实现了双端一致性抽象 |
| **IPC契约** | 统一使用`DigitalLifeBridge`类型定义，kernel crate作为serde契约真源，避免了类型漂移 |
| **事件驱动架构** | 事件通道设计规范（model-stream/pty-output/terminal-stream等），支持流式输出 |

### 1.2 架构问题与优化建议

---

## 二、具体问题点与优化建议

### 🔴 高优先级问题

#### 问题 1：`store.ts` 职责过于膨胀

**位置**: `frontend/src/app/store.ts` (1316行)

**问题**: 单一Store包含80+个action方法，混合了工作区、会话、文件、补丁、任务、命令等多种领域逻辑。

**影响**:
- 代码可维护性差
- 难以单独测试各功能
- 状态更新逻辑复杂难以追踪

**优化建议**:
```
当前: useAppStore (单一Store)
目标: 拆分为领域Store
  - useWorkspaceStore    (工作区/文件树/变更)
  - useConversationStore (会话/消息)
  - useTaskStore        (任务/审批/检查点)
  - usePatchStore       (补丁管理)
  - useUiStore          (UI状态保持不变)
```

---

#### 问题 2：SQLite Schema 存在设计冗余

**位置**: `crates/storage/src/lib.rs` (42-218行)

**问题**: 每个表都有重复的`workspace_id/session_id/status/updated_at/json`列模式，实体表与JSON存储混合。

**当前模式**:
```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
```

**优化建议**:
1. 考虑引入`entity_data`表替代多个独立表：
```sql
CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,  -- 'task'/'session'/'workspace'
    workspace_id TEXT,
    session_id TEXT,
    status TEXT,
    updated_at INTEGER NOT NULL,
    json TEXT NOT NULL
);
CREATE INDEX idx_entities_type ON entities(entity_type, workspace_id, updated_at);
```

2. 或者使用JSON Schema-less设计，但需要添加JSON Schema验证层

---

#### 问题 3：前端组件 `ChangesPanel.tsx` 过长

**位置**: `frontend/src/app/regions/right-panel/ChangesPanel.tsx` (1200行)

**问题**: 单一组件包含过多逻辑（文件树/变更预览/差异查看/大纲/快捷上下文）

**优化建议**: 提取为子组件
```
ChangesPanel/
  ├── ChangesPanelHeader.tsx      (分支选择/菜单)
  ├── ChangesNavigator.tsx        (文件树/列表/大纲切换)
  ├── ChangesStats.tsx            (staged/modified/untracked统计)
  ├── PatchReviewSummary.tsx      (补丁审阅摘要)
  ├── PatchFileCard.tsx           (单个文件补丁卡片)
  ├── PatchHunkCard.tsx           (单个hunk卡片)
  ├── DiffViewerShell.tsx         (差异查看器包装)
  └── ChangesPanelFooter.tsx      (应用/回滚按钮)
```

---

### 🟡 中优先级问题

#### 问题 4：`kernel` crate 类型定义过于集中

**位置**: `crates/kernel/src/types.rs` (1263行)

**问题**: 所有IPC类型定义在单个文件中，导致：
- 文件过大难导航
- 类型间隐式耦合

**优化建议**: 按领域拆分
```
kernel/src/
├── lib.rs
├── types/
│   ├── workspace.rs    (WorkspaceMeta/GitSnapshot等)
│   ├── session.rs      (Session/Message相关)
│   ├── task.rs         (Task/Approval/Checkpoint)
│   ├── patch.rs        (PatchSet/FilePatch/Hunk)
│   └── runtime.rs      (AgentRun/RunActivity)
└── constants.rs
```

---

#### 问题 5：前端Store中重复的状态转换逻辑

**位置**: `frontend/src/app/store.ts`

**问题**: 多个action中重复相似的模式：
```typescript
const result = await window.digitalLife.xxx.method(...);
if (!result.ok) {
    set({ error: result.error.message });
    return;
}
// 成功处理...
```

**优化建议**: 提取为错误处理hook
```typescript
// hooks/useIpc.ts
function useIpc<T>(selector: (store) => Promise<IpcResult<T>>) {
  const [error, setError] = useState<string>();
  const handleError = useCallback((err: IpcError) => {
    setError(err.message);
  }, []);
  // ...
}
```

---

#### 问题 6：`ConversationBlock` 枚举过宽

**位置**: `crates/kernel/src/types.rs` (628-669行)

**问题**: 使用外部tag变体导致与其他模块耦合，且不支持variant-specific metadata。

**当前**:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ConversationBlock {
    Markdown { id: String, text: String },
    Plan { id: String, title: String, items: Vec<...> },
    // ...
}
```

**优化建议**: 考虑使用enumset或泛型变体

---

### 🟢 低优先级问题

#### 问题 7：部分crate缺少公开测试

**位置**: 多个crate的`lib.rs`

**问题**: 仅kernel、terminal、conversation有`#[cfg(test)]`模块。

**优化建议**: 为storage/workspace/task等crate补充单元测试，特别是边界条件。

---

## 三、性能优化点

### 3.1 前端性能

| 问题 | 位置 | 建议 |
|------|------|------|
| LRU缓存限制硬编码 | `store.ts:62-65` | 暴露为配置项 |
| 大量`useMemo` | `ChangesPanel.tsx` | 考虑`useDeferredValue`处理非关键计算 |
| 事件订阅未清理 | `store.ts:662-701` | sendMessage中finally确保清理 |

### 3.2 后端性能

| 问题 | 位置 | 建议 |
|------|------|------|
| SQLite连接无连接池 | `storage/lib.rs:10-11` | 考虑使用r2d2或deadpool |
| 同步数据库锁 | `storage/lib.rs:28-29` | 考虑async版本的rusqlite |
| 字符串拼接构建SQL | `storage/lib.rs:337-346` | 考虑使用prepared statement缓存 |

---

## 四、重构实施路线图

### Phase 1: Store拆分（高优先级）
```
Step 1: 创建 useWorkspaceStore (从store.ts提取)
Step 2: 创建 useConversationStore
Step 3: 创建 usePatchStore
Step 4: 验证功能一致性
```

### Phase 2: 前端组件拆分（中优先级）
```
Step 1: 拆分 ChangesPanel.tsx
Step 2: 拆分 FilesPanel相关组件
Step 3: 提取通用Editor组件
```

### Phase 3: 后端模块化（低优先级）
```
Step 1: kernel类型拆分
Step 2: storage schema优化
Step 3: 补充单元测试
```

---

## 五、总体评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构清晰度 | 8/10 | 模块划分合理，契约清晰 |
| 代码组织 | 6/10 | 部分文件过大需拆分 |
| 可维护性 | 7/10 | 类型系统完善，文档缺失 |
| 性能 | 7/10 | 基础良好，部分优化空间 |
| 测试覆盖 | 5/10 | 需补充Rust单测 |

**核心建议**: 优先拆分`store.ts`和`ChangesPanel.tsx`，这两个文件是当前维护性的主要瓶颈。
