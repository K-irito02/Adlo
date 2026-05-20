# AI Digital Life 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 根据重构洞察报告，逐问题修复代码质量问题，保持功能不变，提升可维护性。

**Architecture:** 采用红绿测试驱动开发，每个问题独立重构，验证功能一致性后再推进下一个问题。

**Tech Stack:** TypeScript + React + Zustand + Rust + Tauri + Vitest

---

## 重构问题清单

| 问题编号 | 优先级 | 问题标题 | 状态 |
|----------|--------|----------|------|
| 1 | 🔴 高 | `store.ts` 职责过于膨胀 | 待处理 |
| 2 | 🔴 高 | SQLite Schema 存在设计冗余 | 待处理 |
| 3 | 🔴 高 | `ChangesPanel.tsx` 过长 | 待处理 |
| 4 | 🟡 中 | `kernel` crate 类型定义过于集中 | 待处理 |
| 5 | 🟡 中 | 前端Store中重复的状态转换逻辑 | 待处理 |
| 6 | 🟡 中 | `ConversationBlock` 枚举过宽 | 待处理 |
| 7 | 🟢 低 | 部分crate缺少公开测试 | 待处理 |

---

## 🔴 高优先级问题

---

## Task 1: `store.ts` 职责拆分 - Part 1: 创建领域Store

**Files:**
- 新建: `frontend/src/app/stores/useWorkspaceStore.ts`
- 新建: `frontend/src/app/stores/useConversationStore.ts`
- 新建: `frontend/src/app/stores/usePatchStore.ts`
- 新建: `frontend/src/app/stores/useTaskStore.ts`
- 新建: `frontend/src/app/stores/index.ts`
- 修改: `frontend/src/app/store.ts`
- 测试: `frontend/src/app/__tests__/stores/`

### 1.1 创建目录和类型文件
- [ ] **Step 1: 创建stores目录和索引文件**
  ```bash
  mkdir -p e:\Programs\Obsidian\notes\ai-digital-life\frontend\src\app\stores
  mkdir -p e:\Programs\Obsidian\notes\ai-digital-life\frontend\src\app\__tests__\stores
  ```

### 1.2 创建 useWorkspaceStore
- [ ] **Step 2: 读取原 store.ts 提取工作区状态**
  从原 store 提取以下内容到 useWorkspaceStore:
  - `workspace`
  - `workspaceRoot`
  - `workspaceMeta`
  - `gitBranch`
  - `gitStatus`
  - `snapshot`
  - `error` (错误状态)
  - 相关的 actions

- [ ] **Step 3: 创建 useWorkspaceStore.ts**
  ```typescript
  import { create } from 'zustand';
  import { persist, createJSONStorage } from 'zustand/middleware';
  import { WorkspaceMeta, GitBranch, GitStatus, GitSnapshot, IpcError, IpcResult } from '../../shared/ipc';

  interface WorkspaceState {
    workspace: string | null;
    workspaceRoot: string | null;
    workspaceMeta: WorkspaceMeta | null;
    gitBranch: GitBranch | null;
    gitStatus: GitStatus | null;
    snapshot: GitSnapshot | null;
    error: string | null;
    
    // Actions
    openWorkspace: (path: string) => Promise<void>;
    refreshWorkspace: () => Promise<void>;
    refreshGit: () => Promise<void>;
    refreshGitStatus: () => Promise<void>;
    setWorkspaceRoot: (root: string) => void;
    resetWorkspace: () => void;
    setError: (error: string | null) => void;
  }

  export const useWorkspaceStore = create<WorkspaceState>()(
    persist(
      (set, get) => ({
        // 状态
        workspace: null,
        workspaceRoot: null,
        workspaceMeta: null,
        gitBranch: null,
        gitStatus: null,
        snapshot: null,
        error: null,

        // Actions 实现与原 store 保持一致
        openWorkspace: async (path: string) => { /* 实现 */ },
        refreshWorkspace: async () => { /* 实现 */ },
        refreshGit: async () => { /* 实现 */ },
        refreshGitStatus: async () => { /* 实现 */ },
        setWorkspaceRoot: (root: string) => set({ workspaceRoot: root }),
        resetWorkspace: () => set({
          workspace: null,
          workspaceRoot: null,
          workspaceMeta: null,
          gitBranch: null,
          gitStatus: null,
          snapshot: null,
          error: null
        }),
        setError: (error: string | null) => set({ error }),
      }),
      {
        name: 'adl-workspace-storage',
        storage: createJSONStorage(() => localStorage),
      }
    )
  );
  ```

### 1.3 创建其他领域Store
- [ ] **Step 4: 创建 useConversationStore.ts** - 管理会话、消息等
- [ ] **Step 5: 创建 usePatchStore.ts** - 管理补丁状态
- [ ] **Step 6: 创建 useTaskStore.ts** - 管理任务、审批、检查点
- [ ] **Step 7: 创建 useUiStore.ts** (保持原 UI 状态)

### 1.4 兼容性迁移
- [ ] **Step 8: 更新原 store.ts** - 使用新的领域Store并保持向后兼容
  ```typescript
  // store.ts 变为兼容性包装层
  export const useAppStore = create<...>()((set, get) => {
    // 委托给新的领域Store
    const wsStore = useWorkspaceStore.getState();
    const convStore = useConversationStore.getState();
    // ...
  });
  ```

### 1.5 测试验证
- [ ] **Step 9: 运行类型检查**
  ```bash
  cd e:\Programs\Obsidian\notes\ai-digital-life\frontend
  npm run typecheck
  ```
  Expected: No errors

- [ ] **Step 10: 运行现有测试**
  ```bash
  npm test
  ```
  Expected: All tests pass

- [ ] **Step 11: 手动验证应用功能**
  ```bash
  npm run dev:browser
  ```
  验证工作区、会话、文件树、变更面板等功能正常

---

## Task 2: ChangesPanel 组件拆分

**Files:**
- 新建: `frontend/src/app/regions/right-panel/ChangesPanel/index.tsx`
- 新建: `frontend/src/app/regions/right-panel/ChangesPanel/ChangesPanelHeader.tsx`
- 新建: `frontend/src/app/regions/right-panel/ChangesPanel/ChangesNavigator.tsx`
- 新建: `frontend/src/app/regions/right-panel/ChangesPanel/ChangesStats.tsx`
- 新建: `frontend/src/app/regions/right-panel/ChangesPanel/PatchFileCard.tsx`
- 新建: `frontend/src/app/regions/right-panel/ChangesPanel/ChangesPanelFooter.tsx`
- 重命名: `frontend/src/app/regions/right-panel/ChangesPanel.tsx` → `ChangesPanel.old.tsx` (保留作为参考)

### 2.1 准备工作
- [ ] **Step 1: 创建 ChangesPanel 目录**
  ```bash
  mkdir -p e:\Programs\Obsidian\notes\ai-digital-life\frontend\src\app\regions\right-panel\ChangesPanel
  ```

### 2.2 提取子组件
- [ ] **Step 2: 读取原 ChangesPanel.tsx** (确保有完整内容)
- [ ] **Step 3: 提取 ChangesPanelHeader.tsx** - 分支选择、菜单等
- [ ] **Step 4: 提取 ChangesNavigator.tsx** - 文件树/列表/大纲切换
- [ ] **Step 5: 提取 ChangesStats.tsx** - staged/modified/untracked 统计
- [ ] **Step 6: 提取 PatchFileCard.tsx** - 单个文件补丁卡片
- [ ] **Step 7: 提取 ChangesPanelFooter.tsx** - 应用/回滚按钮

### 2.3 组装新组件
- [ ] **Step 8: 创建新的 ChangesPanel/index.tsx** - 组装所有子组件
- [ ] **Step 9: 更新 App.tsx 中的引用**

### 2.4 验证
- [ ] **Step 10: 运行类型检查和测试**
- [ ] **Step 11: 手动验证变更面板所有功能**

---

## Task 3: kernel 类型定义拆分

**Files:**
- 新建: `crates/kernel/src/types/workspace.rs`
- 新建: `crates/kernel/src/types/session.rs`
- 新建: `crates/kernel/src/types/task.rs`
- 新建: `crates/kernel/src/types/patch.rs`
- 新建: `crates/kernel/src/types/runtime.rs`
- 新建: `crates/kernel/src/types/mod.rs`
- 修改: `crates/kernel/src/lib.rs`
- 修改: `crates/kernel/src/types.rs` (保持向后兼容导出)

### 3.1 创建类型目录
- [ ] **Step 1: 创建 types 目录**
  ```bash
  mkdir -p e:\Programs\Obsidian\notes\ai-digital-life\crates\kernel\src\types
  ```

### 3.2 拆分类型
- [ ] **Step 2: 读取 types.rs 完整内容**
- [ ] **Step 3: 提取 workspace.rs** - WorkspaceMeta, GitBranch, GitStatus, GitSnapshot
- [ ] **Step 4: 提取 session.rs** - Session, Message, ConversationBlock, Conversation
- [ ] **Step 5: 提取 task.rs** - Task, Approval, Checkpoint
- [ ] **Step 6: 提取 patch.rs** - PatchSet, FilePatch, Hunk
- [ ] **Step 7: 提取 runtime.rs** - AgentRun, RunActivity, AgentExecutionSummary

### 3.3 导出整合
- [ ] **Step 8: 创建 types/mod.rs** - 统一导出所有子模块
- [ ] **Step 9: 更新 lib.rs** - 从 types/mod.rs 重新导出
- [ ] **Step 10: 保持 types.rs 兼容性** - 导出相同的符号

### 3.4 验证
- [ ] **Step 11: 运行 Rust 检查**
  ```bash
  cd e:\Programs\Obsidian\notes\ai-digital-life
  cargo check
  ```
  Expected: No errors

- [ ] **Step 12: 运行 Rust 测试**
  ```bash
  cargo test --workspace
  ```
  Expected: All tests pass

---

## Task 4: 通用 IPC 错误处理 Hook

**Files:**
- 新建: `frontend/src/hooks/useIpc.ts`

- [ ] **Step 1: 创建 useIpc hook**
  ```typescript
  import { useState, useCallback } from 'react';
  import type { IpcResult, IpcError } from '../shared/ipc';

  export function useIpc<T>() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const execute = useCallback(async (
      operation: () => Promise<IpcResult<T>>
    ): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await operation();
        if (!result.ok) {
          setError(result.error.message);
          return null;
        }
        return result.value;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return null;
      } finally {
        setLoading(false);
      }
    }, []);

    const clearError = useCallback(() => setError(null), []);

    return { loading, error, execute, clearError };
  }
  ```

- [ ] **Step 2: 在 store actions 中逐步替换重复代码** (可选，作为 Phase 2)

---

## 🟡 中优先级问题 (Phase 2)

## Task 5: SQLite Schema 优化评估

**注意:** 这是架构层面的优化，需要谨慎评估，因为涉及数据迁移。
- [ ] **Step 1: 创建 schema 优化设计文档**
- [ ] **Step 2: 制定数据迁移策略**
- [ ] **Step 3: 实现变更并编写迁移代码**
- [ ] **Step 4: 全面测试**

---

## Task 6: ConversationBlock 枚举优化

**Files:**
- 修改: `crates/kernel/src/types/session.rs` (在类型拆分后)

- [ ] **Step 1: 设计更灵活的枚举结构**
- [ ] **Step 2: 实现并保持 JSON 格式兼容性**
- [ ] **Step 3: 更新所有使用处**

---

## 🟢 低优先级问题 (Phase 3)

## Task 7: 补充 Rust 单元测试

**Files:**
- 新建: `crates/storage/src/lib_test.rs` (或 tests/ 目录)
- 新建: `crates/workspace/src/lib_test.rs`
- 新建: `crates/task/src/lib_test.rs`

---

## 验证清单 (每个任务后执行)

### 🔴 重构前保存基准状态
```bash
cd e:\Programs\Obsidian\notes\ai-digital-life
git status
git diff  # 确保在干净的工作区开始
```

### 🔴 红绿测试标准流程

1. **类型检查**
   ```bash
   cd frontend
   npm run typecheck
   ```

2. **前端测试**
   ```bash
   npm test
   ```

3. **Rust 检查**
   ```bash
   cd ..
   cargo check
   ```

4. **Rust 测试**
   ```bash
   cargo test --workspace
   ```

5. **手动验证应用**
   ```bash
   cd frontend
   npm run dev:browser
   ```
   - 工作区打开
   - 会话创建
   - 变更面板
   - 补丁应用/回滚
   - 终端
   - 文件树

---

## 整体实施路线图

| Phase | 任务 | 预期时间 | 优先级 |
|-------|------|----------|--------|
| Phase 1 | Task 1 (Store 拆分) | 高 | 🔴 |
| Phase 1 | Task 2 (ChangesPanel 拆分) | 高 | 🔴 |
| Phase 1 | Task 3 (kernel 类型拆分) | 高 | 🔴 |
| Phase 2 | Task 4 (IPC Hook) | 中 | 🟡 |
| Phase 2 | Task 5 (SQLite Schema) | 中 | 🟡 |
| Phase 2 | Task 6 (ConversationBlock) | 中 | 🟡 |
| Phase 3 | Task 7 (补充测试) | 低 | 🟢 |

---

## 核心原则

1. ✅ **保持功能不变** - 所有重构都是内部实现优化
2. ✅ **无负面改进** - 避免引入新问题
3. ✅ **红绿测试** - 每个任务后完整验证
4. ✅ **渐进式推进** - 一个问题处理完再下一个
