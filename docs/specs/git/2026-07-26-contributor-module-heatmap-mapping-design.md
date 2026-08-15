# 贡献者模块热力图 — 自定义映射系统设计

## 概述

将「贡献者模块」热力图（ContributorModuleHeatmap）的 x 轴从 5 个硬编码模块（Frontend/Backend/Database/Testing/Docs）改造为动态目录驱动的可自定义映射系统。支持默认自动检测仓库顶层目录，以及通过可视化编辑器自定义目录→模块的映射规则。

## 后端改动

### `crates/types/src/types/git_visualization.rs`

`GitVisContributorModules` 新增字段：

```rust
pub struct GitVisContributorModules {
    pub matrix: Vec<GitVisContributorModule>,
    pub all_directories: Vec<DirectoryEntry>,  // 新增
}

pub struct DirectoryEntry {
    pub path: String,           // 相对仓库根路径，如 "frontend/src/components"
    pub depth: u32,             // 目录深度（顶层 = 1）
    pub commit_count: u32,      // 该目录涉及的 commit 数
}
```

### `crates/workspace/src/git/git_vis/contributor.rs`

1. 遍历 `git log --name-only` 时，除统计模块归属外，同时构建目录树统计信息
2. 每个变更文件的目录路径逐级拆解并计入 `commit_count`
3. 返回 `all_directories` 字段供前端映射编辑器使用

## 映射配置文件

### 存储位置

`{workspace}/.git-vis/module-mapping.json`

### 格式

```json
{
  "version": 1,
  "rules": [
    { "path": "frontend/**",        "module": "前端",       "type": "glob" },
    { "path": "frontend/workers/**", "module": "后端服务",   "type": "glob", "override": true },
    { "path": "backend/**",         "module": "后端",       "type": "glob" },
    { "path": "docs/**",            "module": "文档",       "type": "glob" },
    { "path": "shared/utils/**",    "module": "公共工具",   "type": "glob" }
  ],
  "options": {
    "enableOtherBucket": false,
    "unmappedStrategy": "keep_original"
  }
}
```

### 规则优先级

1. **`override: true` 精确匹配** — 显式标记覆盖的规则优先级最高
2. **最长路径匹配** — 路径深度最大的 `path` 规则（长度非层级）
3. **首次匹配** — 同长度按文件中出现顺序
4. **无匹配** — 走 `unmappedStrategy` 策略

### 无配置文件时

纯动态目录驱动，每个顶层目录名为一列。

## 映射编辑器 UI

位置：Git 可视化视图中，"模块"标签页齿轮按钮唤出。

```
┌─────────────────────────────────────────────────────┐
│  模块映射管理                          [关闭 ✕]      │
├──────────────────────┬──────────────────────────────┤
│  仓库目录树           │  已定义模块                   │
│                      │                              │
│  📁 frontend/  120   │  ┌─ 前端 ──── [✎] [✕] ─┐   │
│    📁 src/  95       │  │ frontend/**           │   │
│      📁 comps/  40   │  └──────────────────────┘   │
│      📁 utils/  20   │  ┌─ 后端 ──── [✎] [✕] ─┐   │
│    📁 public/  25    │  │ backend/**            │   │
│  📁 backend/   80    │  └──────────────────────┘   │
│    📁 api/  50       │  ┌─ 文档 ──── [✎] [✕] ─┐   │
│  📁 docs/  30        │  │ docs/**               │   │
│  📁 shared/  45      │  └──────────────────────┘   │
│    📁 utils/  25     │  ┌─ + 新建模块 ──────────┐   │
│  📁 vendor/  10      │  │                        │   │
│                      │  └────────────────────────┘   │
│                      │                              │
│                      │  底层设置                     │
│                      │  ☐ 启用 Other 归并收纳        │
│                      │  ☑ 未映射目录保留原名          │
├──────────────────────┴──────────────────────────────┤
│           [恢复默认]          [保存并应用]            │
└─────────────────────────────────────────────────────┘
```

### 交互

- 左侧目录树可展开/折叠（下钻），每个节点显示路径 + commit 数
- 拖拽目录节点到右侧模块卡片上 → 创建映射规则
- 右键目录节点 → "映射到模块..." / "取消映射"
- hover 模块卡片 → 高亮左侧被映射的目录节点
- hover 目录节点 → tooltip 显示完整路径、commit 数、当前映射模块
- 模块卡片：点击名称重命名、✕ 删除（目录恢复未映射状态）
- "+ 新建模块" → 输入模块名 → 创建空模块等待拖入目录

## 前端适配器变更

### `chartDataAdapters.ts`

新增 `applyModuleMapping()` 函数：

```
输入: matrix: GitVisContributorModule[], rules: MappingRule[]
输出: GitVisContributorModule[] (目录名已映射为模块名)

流程:
  for each contributor:
    for each file module:
      path ← 相对于仓库根的目录路径
      按规则优先级集匹配最具体的 rule
      命中 → 文件归入 rule.module
      未命中 → 按 unmappedStrategy 处理
    end
    合并同一 module 下的 count
  end
```

原有 `contributorModulesToHeatmapColumns()` 不变，接收映射后的数据直接生成 `HeatmapColumn[]`。

### `ContributorModuleHeatmap.tsx`

- 删除 `MODULE_KEYS` 硬编码数组
- 删除 `MODULE_KEYS[i]` → i18n 的 remap 逻辑
- `columnLabel` 直接使用 adapter 输出的标签
- i18n key 改为描述性文字（"模块映射管理"按钮等）

### 新增 hook `useModuleMapping()`

```typescript
function useModuleMapping(workspaceId: string): {
  rules: MappingRule[];
  saveRules: (rules: MappingRule[]) => Promise<void>;
  resetToDefault: () => Promise<void>;
  directoryTree: DirectoryEntry[];
  isLoading: boolean;
  error: Error | null;
}
```

- 读取 `{workspace}/.git-vis/module-mapping.json`
- 文件变更时自动重载（watch API）
- 提供 `saveRules` 写入配置

## x 轴标签重叠解决方案

### B1 紧凑模式（默认）

| 模块数 | 行为 |
|--------|------|
| ≤ 8 | 完整显示，正常字间距 |
| 8 < n ≤ 15 | 标签倾斜 30° + 单行截断（max-width 按列宽计算），hover tooltip 显示全称 |
| > 15 | 倾斜 30° + 截断 + 自动折叠 Top 12，其余归入 Other（hover 可展开查看明细） |

### B2 可读模式（右上角可切换）

| 特性 | 行为 |
|------|------|
| 多行换行 | max 2 行，字号从 12px 自适应缩至 9px |
| 间距保证 | 列间 min 8px，字号优先缩小至下限 |
| 仍溢出 | 省略号 `…` + hover tooltip 全称 |

### 列宽滑块（高级）

热力图右上角增加滑块，向左→更多列同时可见（截断更多），向右→更少列但标签更完整（横向滚动）。

## 边界情况

| 情况 | 处理方式 |
|------|----------|
| 无 `module-mapping.json` | 纯动态目录驱动，每个顶层目录一列 |
| 配置损坏（JSON parse 失败） | fallback 到动态目录，UI 显示黄色警告条 |
| 目录被删除/重命名 | 旧规则自动不匹配，该目录回归未映射状态 |
| 同一模块映射 20+ 目录 | x 轴只显示该模块一列，无需处理 |
| 根目录文件（无顶层目录） | 支持 `{ "path": ".", "module": "Root" }` 规则 |
| 多 workspace 切换 | 每个 workspace 独立存储配置，切换时重新加载 |
| 未映射目录过多 | Other 开关开启时归并；关闭时各自成列（按 commit 排序 Top N） |
| 同名模块冲突 | 编辑器创建时校验唯一性 |

## 受影响的范围

| 模块 | 改动 |
|------|------|
| `git_visualization.rs` | +2 结构体 (`DirectoryEntry`, `all_directories`) |
| `contributor.rs` | 目录树统计逻辑 |
| `chartDataAdapters.ts` | 新增 `applyModuleMapping()` |
| `ContributorModuleHeatmap.tsx` | 删除 `MODULE_KEYS` 硬编码，移除 i18n remap |
| `HeatmapChart` | x 轴标签旋转/截断/换行动画增强 |
| `HeatmapXAxis` | 倾斜角度 prop，截断逻辑，tooltip 支持 |
| 新建 `ModuleMappingEditor.tsx` | 映射编辑器弹窗组件 |
| 新建 `useModuleMapping.ts` | 映射配置 hook |
| 新建 `module-mapping.d.ts` | 映射规则类型定义 |
| `HeatmapCardGroup.tsx` | 模块 tab 增加齿轮按钮 |
| 前端测试 | adapter 单元测试、编辑器组件测试、视觉回归测试 |

## 数据流

```
git log --name-only
  → 后端 contributor.rs
    → 文件统计 + 目录树统计
    → GitVisContributorModules { matrix, all_directories }
  → Tauri IPC
  → 前端 useChartData hook
    → applyModuleMapping( matrix, useModuleMapping().rules )
      → 目录名 → 模块名映射 + 未映射兜底
    → contributorModulesToHeatmapColumns( mapped )
      → HeatmapColumn[]
  → ContributorModuleHeatmap
    → HeatmapChart (with label rotation/truncation)
```

## 测试策略

| 层级 | 内容 |
|------|------|
| 单元测试 | `applyModuleMapping()` — 通配匹配、精确覆盖、未映射兜底、空规则、多规则优先级 |
| 组件测试 | 编辑器渲染、拖拽创建映射、模块 CRUD、配置保存/加载 |
| 集成测试 | 后端数据 → adapter → HeatmapChart 渲染链路 |
| 视觉回归 | x 轴标签在 5/10/20 列下的倾斜/截断/换行表现 |
| 边界测试 | 空仓库、单目录仓库、深层嵌套、无映射文件、配置损坏 |
