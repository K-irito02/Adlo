# ChangesPanel 组件提取 — 经验教训

> 日期: 2026-05-25
> 关联重构: 第十一轮 — ChangesPanel 组件提取到 patch-review 模块

## 本次重构涉及的功能

- PatchHunkCard 提取：将 hunk 级别的卡片渲染从 ChangesPanel.tsx 提取到 `features/patch-review/PatchHunkCard.tsx`
- PatchFileCard 提取：将文件级别的聚合卡片提取到 `features/patch-review/PatchFileCard.tsx`
- PatchReviewSummary 提取：将补丁摘要统计 + 过滤操作栏提取到 `features/patch-review/PatchReviewSummary.tsx`
- patch-review 模块索引统一导出：`index.ts` 统一导出所有类型 + 组件

---

## 教训记录

### 1. 渐进式内部组件模式（最安全的重构策略）

**问题**：直接创建外部模块文件并修改 import 路径会导致两个问题：Vite 预编译缓存报错（Pre-transform error），以及项目可能完全不可运行。

**解决方案**：采用"内部组件创建 → 替换内联 JSX → 类型检查验证 → 外部模块迁移"的四步渐进模式：
1. 先在 ChangesPanel.tsx 内部创建组件函数（同一文件，不改变构建图）
2. 将原有内联 JSX 替换为内部组件，**先确保功能等价**
3. 运行 `npm run frontend:typecheck` 确认零类型错误
4. 再创建外部模块文件，复制组件代码到新文件
5. 更新 import/export，删除内部组件定义
6. 再次运行类型检查确认

**教训**：任何"先搬出去再修复"的方法都不可靠。必须确保每一步都有可验证的中间态。

### 2. 类型导入路径管理

**问题**：从 ChangesPanel.tsx 提取组件到 `features/patch-review/` 目录时，所有相对导入路径都发生了变化。例如 `../../icons` → `../../icons`（层级不同），Types.ts 类型的导入路径也完全不同。

**解决方案**：按依赖类型分类处理：
- 项目内部工具函数（如 `getChangeKindLabel`）：如果在目标模块目录中不可用，保持原有导入路径，或将该工具函数也提取到共享位置
- Icon 组件：统一从 `../../icons` 导入（在 patch-review 模块中）或 `../../../icons`（在 ChangesPanel 同级别的 panels 目录中）
- 公共类型（如 `PatchHunkSummary`）：从相邻的 `./patchReview` 导入
- 外部包类型（如 `PatchHunkDecision`）：从 `@ai-digital-life/kernel` 直接导入，避免依赖模块内部转发

**教训**：提取组件时，必须先分析目标文件位置到所有依赖的相对路径。批量修改路径后，类型检查是最快的验证手段。

### 3. 类型导入不要走模块内部转发

**问题**：`PatchHunkDecision` 最初从 `patch-review/index.ts` 导入，但 `PatchHunkCard.tsx` 和 `PatchFileCard.tsx` 不在同模块中通过 re-export 获取该类型——类型检查报错 "Module has no exported member"。

**解决方案**：直接从 `@ai-digital-life/kernel` 导入 `PatchHunkDecision`，因为该类型是 kernel crate 的一部分，不走模块内部转发。

**教训**：外部包的类型（`@ai-digital-life/kernel`）应始终从其真源导入，而不是通过项目内部模块 re-export 间接引用。

### 4. Vite Pre-transform 缓存问题

**问题**：在重构过程中将 ChangesPanel.tsx 的内容做了大幅删减（删除内部组件），Vite 会报 Pre-transform error。这是因为 Vite 的缓存是基于文件的，大幅修改后需要重启 dev server。

**解决方案**：
- 不必惊慌，这是 Vite 的缓存的正常行为
- 类型检查（`npm run frontend:typecheck`）是更可靠的验证手段
- 如果 dev server 已运行，需要重启 `npm run dev:browser`
- 或者清空 `node_modules/.vite` 缓存目录

**教训**：区分 Vite 缓存失效错误和真实的代码错误。在没有 dev server 的情况下，类型检查是纯静态的可信验证。

### 5. Props 类型的显式导出

**问题**：提取的组件需要被 ChangesPanel 使用，ChangesPanel 通过 `PatchReviewSummaryProps` 类型来验证 props。如果组件文件只 export 了函数组件而没有 export 类型，ChangesPanel 就只能用隐式类型推断。

**解决方案**：每个提取的组件文件同时 export 组件函数和 props 接口（`export { PatchHunkCard }` + `export type { PatchHunkCardProps }`）。在 `index.ts` 中分两行分别导出值和类型：
```typescript
export { PatchHunkCard } from "./PatchHunkCard";
export type { PatchHunkCardProps } from "./PatchHunkCard";
```

**教训**：TypeScript 的 `isolatedModules` 模式下，type export 需要显式使用 `export type` 语法。在模块索引文件中，组件 export 需要值和类型分开导出。

### 6. index.ts 统一导出的必要性

**问题**：如果没有统一导出，ChangesPanel 需要从多个路径分别导入组件：
```typescript
import { PatchHunkCard } from "../../../features/patch-review/PatchHunkCard";
import { PatchFileCard } from "../../../features/patch-review/PatchFileCard";
```

**解决方案**：在 `patch-review/index.ts` 中统一导出所有组件和类型：
```typescript
export { PatchHunkCard } from "./PatchHunkCard";
export type { PatchHunkCardProps } from "./PatchHunkCard";
export { PatchFileCard } from "./PatchFileCard";
export type { PatchFileCardProps } from "./PatchFileCard";
export { PatchReviewSummary } from "./PatchReviewSummary";
export type { PatchReviewSummaryProps } from "./PatchReviewSummary";
```

ChangesPanel 只需一条 import：
```typescript
import { PatchHunkCard, PatchFileCard, PatchReviewSummary } from "../../../features/patch-review";
```

**教训**：统一导出模式让模块的使用成本最低，模块内部文件重组不影响消费者。

---

## 架构决策摘要

| 决策 | 选项 A | 选项 B（选择） | 原因 |
|------|--------|----------------|------|
| 重构策略 | 直接创建+复制+替换 | 内部组件→验证→外部迁移 | 保证每一步都有可验证的中间态 |
| 类型导入来源 | 模块 index re-export | 直接从 kernel 导入 | 外部包类型从真源导入，不依赖模块内部转发 |
| 类型导出方式 | 仅组件函数 | 组件 + Props 类型都导出 | 满足 TypeScript isolatedModules 要求 |
| 模块导出方式 | 分散导入 | index.ts 统一导出 | 降低使用成本，封装内部结构 |
| 验证手段 | 仅查看 dev server | tsc --noEmit 类型检查 | 类型检查不依赖运行时状态 |
