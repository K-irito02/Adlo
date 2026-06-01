# 重构实施计划

**生成日期**：2026-06-01  
**基于重构洞察报告**：[refactor-insight-2026-06-01.md](refactor-insight-2026-06-01.md)

---

## 目录

1. [概览与原则](#概览与原则)
2. [重构任务清单（按优先级）](#重构任务清单按优先级)
3. [🔴 高优先级任务](#高优先级任务)
4. [🟡 中优先级任务](#中优先级任务)
5. [🟢 低优先级任务](#低优先级任务)
6. [验证与质量检查](#验证与质量检查)

---

## 概览与原则

### 实施原则
- ✅ **保持现有 UI/UX 不变**：仅重构内部实现，不影响用户可见行为
- ✅ **避免任何负面改进**：重构不引入功能退化
- ✅ **代码结构清晰、易维护**：消除冗余，提高可读性
- ✅ **渐进式重构**：小步前进，每个任务独立可验证
- ✅ **充分测试**：每项重构后进行验证

### 任务统计
| 优先级 | 数量 | 预计工作量 |
|--------|------|-----------|
| 🔴 高 | 3 项 | 3-4 小时 |
| 🟡 中 | 9 项 | 6-8 小时 |
| 🟢 低 | 4 项 | 2-3 小时 |

---

## 重构任务清单（按优先级）

### 🔴 高优先级（立即执行）

| ID | 任务 | 问题来源 | 预计时间 |
|----|------|----------|----------|
| H1 | 消除重复代码：提取 `trimOldRuns` 和 `trimActivityList` 到共享模块 | [fetchActions.ts:13-61](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/fetchActions.ts#L13-L61), [sessionSlice.ts:45-93](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/sessionSlice.ts#L45-L93) | 45 分钟 |
| H2 | 优化 Zustand store 选择器性能：引入 `shallow` 比较 | [slicedStore.ts:65-104](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slicedStore.ts#L65-L104) | 1.5 小时 |
| H3 | 改进全局缓存：添加 TTL 和大小限制 | [shared.ts:140-167](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/shared.ts#L140-L167) | 1.5 小时 |

### 🟡 中优先级（高优先级完成后执行）

| ID | 任务 | 问题来源 | 预计时间 |
|----|------|----------|----------|
| M1 | 统一 Action 定义组织：将 `TaskActions` 和 `CommandActions` 移至独立文件 | [StoreState.ts:31-33](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/StoreState.ts#L31-L33) | 30 分钟 |
| M2 | 统一批量写入调度实现：复用 `shared.ts` 中的 `createDebouncedWrite` | [workspaceSlice.ts:43-63](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts#L43-L63), [shared.ts:74-111](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/shared.ts#L74-L111) | 45 分钟 |
| M3 | 优化 `parse_config_outline`：缓存正则表达式 | [outline/src/lib.rs:179-215](file:///E:/Programs/Obsidian/notes/ai-digital-life/crates/outline/src/lib.rs#L179-L215) | 30 分钟 |
| M4 | 优化 `classify_profile`：改进字符串匹配 | [command/src/lib.rs:35-52](file:///E:/Programs/Obsidian/notes/ai-digital-life/crates/command/src/lib.rs#L35-L52) | 30 分钟 |
| M5 | 改进 `define_entity_table!` 宏：减少代码膨胀 | [storage/src/lib.rs:362-417](file:///E:/Programs/Obsidian/notes/ai-digital-life/crates/storage/src/lib.rs#L362-L417) | 1 小时 |
| M6 | 优化 `fetchAuditEntries`：使用 Map 替代数组分组 | [fetchActions.ts:120-170](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/fetchActions.ts#L120-L170) | 45 分钟 |
| M7 | 改进 `slashCommandRegistry`：考虑使用依赖注入 | [streamActions.ts:65-99](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/streamActions.ts#L65-L99) | 45 分钟 |
| M8 | 合并 `BrowserTreeEntry` 中的 useEffect 或使用 useReducer | [BrowserTreeEntry.tsx:160,179](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx#L160) | 1 小时 |
| M9 | 改进切片依赖关系文档：考虑独立设计文档 | [slices.ts:4-16](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices.ts#L4-L16) | 30 分钟 |

### 🟢 低优先级（有空时处理）

| ID | 任务 | 问题来源 | 预计时间 |
|----|------|----------|----------|
| L1 | 优化 `detect_root`：添加路径缓存或非递归实现 | [workspace/src/lib.rs:37-62](file:///E:/Programs/Obsidian/notes/ai-digital-life/crates/workspace/src/lib.rs#L37-L62) | 30 分钟 |
| L2 | 优化 `outline_family_map`：缓存为静态表 | [outline/src/lib.rs:54-87](file:///E:/Programs/Obsidian/notes/ai-digital-life/crates/outline/src/lib.rs#L54-L87) | 30 分钟 |
| L3 | 改进 TypeScript 断言可读性：添加注释或使用 zod | [slicedStore.ts:107-109](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slicedStore.ts#L107-L109) | 30 分钟 |
| L4 | 优化 `resolve_existing_parent`：添加缓存 | [fs-ops/src/lib.rs:56-64](file:///E:/Programs/Obsidian/notes/ai-digital-life/crates/fs-ops/src/lib.rs#L56-L64) | 30 分钟 |

---

## 🔴 高优先级任务

### H1: 消除重复代码 - 提取 `trimOldRuns` 和 `trimActivityList`

#### 问题
`fetchActions.ts` 和 `sessionSlice.ts` 中有完全相同的函数实现，违反 DRY 原则。

#### 实施步骤

1. **创建新的共享工具模块**
   - 位置：`frontend/src/app/stores/activityUtils.ts`
   - 导出：`trimOldRuns`, `trimActivityList`, 以及相关常量

2. **迁移常量和函数**
   ```typescript
   // activityUtils.ts
   export const MAX_ACTIVITY_PER_RUN = 500;
   export const MIN_ACTIVITY_RETAIN = 400;
   export const MAX_STORED_RUNS = 50;
   
   import type { DigitalLifeRunActivityEventV1, ModelTokenUsage } from "@ai-digital-life/kernel";
   
   export function trimActivityList(activities: DigitalLifeRunActivityEventV1[]): DigitalLifeRunActivityEventV1[] {
     // 现有实现
   }
   
   export function trimOldRuns(
     activityMap: Record<string, DigitalLifeRunActivityEventV1[]>,
     usageMap: Record<string, ModelTokenUsage | undefined>,
     accessMap: Record<string, number>,
     excludeRunIds: Set<string>
   ) {
     // 现有实现（使用完整类型）
   }
   ```

3. **更新 `sessionSlice.ts`**
   - 删除内联定义的函数和常量
   - 导入并使用 `activityUtils.ts` 中的函数

4. **更新 `fetchActions.ts`**
   - 删除内联定义的函数和常量
   - 导入并使用 `activityUtils.ts` 中的函数
   - 修正类型（之前 `usageMap` 使用 `any`）

#### 验证清单
- [ ] 类型检查通过
- [ ] 所有现有测试通过
- [ ] 运行时行为无变化
- [ ] 会话活动列表正确修剪
- [ ] 旧 run 正确清理

---

### H2: 优化 Zustand store 选择器性能

#### 问题
大型 Zustand store 使用对象选择器时可能导致不必要的重渲染。

#### 实施步骤

1. **创建 `useShallow` hook**
   - 位置：`frontend/src/app/hooks/useShallow.ts`
   ```typescript
   import { useRef, useEffect } from "react";
   import { shallow } from "zustand/shallow";
   
   // 或者直接导出 zustand 自带的 shallow
   export { shallow as useShallow } from "zustand/shallow";
   ```

2. **创建优化的选择器 hook**
   - 位置：`frontend/src/app/stores/useAppStore.ts`
   ```typescript
   import { useAppStore as useAppStoreRaw } from "./slicedStore";
   import { shallow } from "zustand/shallow";
   
   export function useAppStore<T>(selector: (state: StoreState) => T): T {
     return useAppStoreRaw(selector, shallow);
   }
   
   // 或者提供一个可选的 shallow 版本
   export function useAppStoreShallow<T>(selector: (state: StoreState) => T): T {
     return useAppStoreRaw(selector, shallow);
   }
   ```

3. **创建自定义 hooks 封装常用选择器**
   - 位置：`frontend/src/app/hooks/useSession.ts`, `useWorkspace.ts`, 等
   - 按需逐步迁移组件使用

4. **更新现有组件（渐进式）**
   - 识别频繁重渲染的组件
   - 逐步替换选择器

#### 验证清单
- [ ] 类型检查通过
- [ ] React DevTools Profiler 验证重渲染减少
- [ ] 所有现有测试通过
- [ ] UI 功能正常

---

### H3: 改进全局缓存 - 添加 TTL 和大小限制

#### 问题
当前缓存使用简单 Map，缺少过期时间和硬限制，可能导致内存泄漏。

#### 实施步骤

1. **检查现有依赖**
   - 确认项目是否已有 `lru-cache` 或类似库
   - 如无，安装轻量级替代方案

2. **实现带 TTL 的缓存类**
   - 位置：`frontend/src/app/stores/shared.ts`（更新现有或创建新的 `cache.ts`）
   ```typescript
   class TTLCache<K, V> {
     private cache = new Map<K, { value: V; expires: number }>();
     private maxSize: number;
     private ttl: number; // ms
     
     constructor(options: { maxSize: number; ttl: number }) {
       this.maxSize = options.maxSize;
       this.ttl = options.ttl;
     }
     
     set(key: K, value: V): void {
       // 清理过期项
       this.cleanup();
       // 如果超过限制，移除最旧的
       if (this.cache.size >= this.maxSize) {
         const oldestKey = this.cache.keys().next().value;
         if (oldestKey !== undefined) {
           this.cache.delete(oldestKey);
         }
       }
       this.cache.set(key, { value, expires: Date.now() + this.ttl });
     }
     
     get(key: K): V | undefined {
       const item = this.cache.get(key);
       if (!item) return undefined;
       if (Date.now() > item.expires) {
         this.cache.delete(key);
         return undefined;
       }
       return item.value;
     }
     
     private cleanup(): void {
       const now = Date.now();
       for (const [key, item] of this.cache) {
         if (now > item.expires) {
           this.cache.delete(key);
         }
       }
     }
   }
   ```

3. **更新缓存实例**
   - `fileDocumentCache`: 限制为 100 项，TTL 5 分钟
   - `changePreviewCache`: 限制为 50 项，TTL 1 分钟

#### 验证清单
- [ ] 类型检查通过
- [ ] 缓存正确过期
- [ ] 大小限制生效
- [ ] 文档预览功能正常
- [ ] 文件打开功能正常

---

## 🟡 中优先级任务

### M1: 统一 Action 定义组织

#### 问题
`TaskActions` 和 `CommandActions` 内联在 `StoreState.ts` 中，与其他 action 模块不一致。

#### 实施步骤

1. **创建 `actions/taskActions.ts`**
   ```typescript
   import type { StoreState } from "../StoreState";
   
   export interface TaskActions {
     refreshTaskCenter: () => Promise<void>;
     decideApproval: (approvalId: string, decision: "approved" | "rejected") => Promise<void>;
     fetchRunActivityByRunId: (runId: string, limit?: number) => Promise<void>;
   }
   ```

2. **创建 `actions/commandActions.ts`**
   ```typescript
   import type { StoreState } from "../StoreState";
   
   export interface CommandActions {
     runCommand: (command: string, argsText: string) => Promise<void>;
     fetchCommandHistory: () => Promise<void>;
   }
   ```

3. **更新 `StoreState.ts`**
   - 删除内联的 `TaskActions` 和 `CommandActions` 接口
   - 从新文件导入

4. **检查是否有对应的实现文件**
   - 确认 `taskActions.ts` 和 `commandActions.ts` 是否需要实现

#### 验证清单
- [ ] 类型检查通过
- [ ] 导入导出正确
- [ ] 所有 action 接口位置一致

---

### M2: 统一批量写入调度实现

#### 问题
`workspaceSlice.ts` 中有独立的批量写入实现，与 `shared.ts` 中的类似但不完全一致。

#### 实施步骤

1. **检查 `shared.ts` 中的 `createDebouncedWrite`**
   - 确认是否满足 workspace 的需求
   - 如需要，增强以支持 `requestIdleCallback` 回退

2. **更新 `workspaceSlice.ts`**
   - 删除内联的 `pendingWrites`, `writeScheduled`, `scheduleWrite`, `scheduleFlush`
   - 使用 `shared.ts` 中的统一实现

3. **测试验证**
   - 确认 localStorage 持久化仍然正常工作
   - 确认多次写入正确合并

#### 验证清单
- [ ] 类型检查通过
- [ ] localStorage 持久化功能正常
- [ ] 批量合并功能正常
- [ ] 树展开状态正确保存和恢复

---

### M3: 优化 `parse_config_outline` - 缓存正则表达式

#### 问题
每次调用 `parse_config_outline` 都重新创建正则表达式。

#### 实施步骤

1. **使用 `OnceLock` 缓存编译后的正则**
   ```rust
   // outline/src/lib.rs
   use std::sync::OnceLock;
   
   static CONFIG_REGEX: OnceLock<regex::Regex> = OnceLock::new();
   
   fn get_config_regex() -> &'static regex::Regex {
       CONFIG_REGEX.get_or_init(|| {
           regex::Regex::new(r#"your-pattern-here"#).unwrap()
       })
   }
   ```

2. **更新 `parse_config_outline` 使用缓存的正则**

#### 验证清单
- [ ] 编译通过
- [ ] 所有 Rust 测试通过
- [ ] 配置解析功能正常

---

### M4: 优化 `classify_profile` - 改进字符串匹配

#### 问题
每次调用都使用 `to_lowercase()` 创建新字符串。

#### 实施步骤

1. **使用大小写不敏感的匹配**
   - 或者使用 `eq_ignore_ascii_case`
   - 或者预编译模式

#### 验证清单
- [ ] 编译通过
- [ ] 所有 Rust 测试通过
- [ ] 命令分类功能正常

---

### M5: 改进 `define_entity_table!` 宏

#### 问题
宏生成大量重复代码，每个 table 有独立的 `OnceLock`。

#### 实施步骤

1. **评估重构可行性**
   - 判断是否需要立即重构
   - 如果性能可接受，可能先记录为技术债

2. **如果重构**
   - 创建共享的 SQL 模板缓存结构
   - 使用泛型减少重复

#### 验证清单
- [ ] 编译通过
- [ ] 所有 Rust 测试通过
- [ ] 数据库操作正常

---

### M6: 优化 `fetchAuditEntries` - 使用 Map 替代数组分组

#### 问题
当前实现有多次数组遍历，可能导致性能问题。

#### 实施步骤

1. **优化分组逻辑**
   - 使用 `Map` 按 `runId` 分组
   - 减少算法复杂度

#### 验证清单
- [ ] 类型检查通过
- [ ] 审计条目正确显示
- [ ] 性能有可测量改进

---

### M7: 改进 `slashCommandRegistry`

#### 问题
使用全局 Map 管理命令，可能导致状态不一致和难以测试。

#### 实施步骤

1. **考虑使用 Context 或依赖注入**
   - 评估是否需要更改
   - 如果需要，设计新的注册机制

2. **渐进式改进**
   - 如改动过大，可先添加类型安全

#### 验证清单
- [ ] 类型检查通过
- [ ] 斜杠命令功能正常
- [ ] 可测试性提高（如果重构）

---

### M8: 合并 `BrowserTreeEntry` 中的 useEffect

#### 问题
多个 useEffect 可能导致复杂的副作用管理。

#### 实施步骤

1. **分析现有 useEffect**
   - 理解每个的用途
   - 判断是否可以合并或使用 `useReducer`

2. **重构**
   - 合并相关的副作用
   - 或者使用 `useReducer` 管理复杂状态转换

#### 验证清单
- [ ] 类型检查通过
- [ ] 文件树功能正常
- [ ] 展开/折叠功能正常
- [ ] 没有无限循环

---

### M9: 改进切片依赖关系文档

#### 问题
依赖关系仅在注释中，可能不够清晰。

#### 实施步骤

1. **创建独立的架构文档**
   - 位置：`ai-digital-life/docs/architecture/store-dependencies.md`
   - 清晰记录每个 slice 的依赖关系

2. **更新代码注释**
   - 链接到外部文档

#### 验证清单
- [ ] 文档已创建
- [ ] 内容清晰准确

---

## 🟢 低优先级任务

### L1: 优化 `detect_root`

#### 实施步骤
- 添加路径缓存机制
- 或者使用非递归实现

---

### L2: 优化 `outline_family_map`

#### 实施步骤
- 将映射缓存为静态表
- 简化 `detect_outline_family` 实现

---

### L3: 改进 TypeScript 断言可读性

#### 实施步骤
- 添加详细注释
- 或者考虑使用 zod 进行运行时验证（如果需要）

---

### L4: 优化 `resolve_existing_parent`

#### 实施步骤
- 添加路径存在性缓存

---

## 验证与质量检查

### 每项重构后检查

1. **编译/类型检查**
   ```bash
   # Rust
   cargo check --workspace
   
   # TypeScript
   cd ai-digital-life/frontend
   npx tsc --noEmit
   ```

2. **测试**
   ```bash
   # Rust
   cargo test --workspace
   
   # TypeScript
   cd ai-digital-life
   npm test
   ```

3. **手动验证**
   - 运行应用 (`npm run dev:both`)
   - 验证相关功能正常

### 全部完成后检查

- [ ] 完整回归测试通过
- [ ] 无类型错误
- [ ] 无 lint 警告
- [ ] 性能有可测量改进（如适用）
- [ ] 文档更新完成

---

## 附录

### 相关文件清单

**前端 TypeScript**
- [StoreState.ts](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/StoreState.ts)
- [slicedStore.ts](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slicedStore.ts)
- [shared.ts](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/shared.ts)
- [slices/sessionSlice.ts](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/sessionSlice.ts)
- [slices/workspaceSlice.ts](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts)
- [actions/fetchActions.ts](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/fetchActions.ts)
- [features/browser-tree/BrowserTreeEntry.tsx](file:///E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx)

**后端 Rust**
- [storage/src/lib.rs](file:///E:/Programs/Obsidian/notes/ai-digital-life/crates/storage/src/lib.rs)
- [workspace/src/lib.rs](file:///E:/Programs/Obsidian/notes/ai-digital-life/crates/workspace/src/lib.rs)
- [command/src/lib.rs](file:///E:/Programs/Obsidian/notes/ai-digital-life/crates/command/src/lib.rs)
- [outline/src/lib.rs](file:///E:/Programs/Obsidian/notes/ai-digital-life/crates/outline/src/lib.rs)
- [fs-ops/src/lib.rs](file:///E:/Programs/Obsidian/notes/ai-digital-life/crates/fs-ops/src/lib.rs)

---

> 由重构实施计划生成于 2026-06-01
