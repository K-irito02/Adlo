# 多工作区变更面板统计信息修复 - 经验教训

> 日期: 2026-05-25
> 关联设计: `2026-05-24-multi-workspace-changes-terminal-panel-design.md`

## 问题描述

变更面板（Changes Panel）中"已暂存、已修改、未跟踪"三个按钮上的统计数字不正确，只显示当前单一工作区的变更统计，而不是所有可见工作区的合计变更统计。

## 问题根因

在多工作区架构改造完成后，变更面板的统计数字显示逻辑仍停留在单工作区模式，使用了单个 `snapshot` 来计算：
- `staged` 数量只来自当前活动工作区的 `snapshot?.staged.length`
- `unstaged` 数量只来自当前活动工作区的 `snapshot?.unstaged.length`
- `untracked` 数量只来自当前活动工作区的 `snapshot?.untracked.length`

## 修复方案

### 1. 新增合计统计计算

在 `ChangesPanel.tsx` 中新增 `totalChangesStats` 的 useMemo 计算：

```typescript
const totalChangesStats = useMemo(() => {
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  for (const ws of visibleWorkspaces) {
    const snapshot = gitSnapshots[ws.id];
    if (snapshot) {
      staged += snapshot.staged.length;
      unstaged += snapshot.unstaged.length;
      untracked += snapshot.untracked.length;
    }
  }
  return { staged, unstaged, untracked };
}, [visibleWorkspaces, gitSnapshots]);
```

### 2. 扩展 ChangesToolbar 接口

在 `ChangesToolbar.tsx` 的 `ChangesToolbarNavigatorProps` 接口中新增 `totalChangesStats` 属性：

```typescript
interface ChangesToolbarNavigatorProps {
  // ... 其他属性
  totalChangesStats?: { staged: number; unstaged: number; untracked: number };
  // ...
}
```

### 3. 更新统计显示逻辑

在 `NavigatorContextToolbar` 组件中，优先使用 `totalChangesStats`，回退到 `snapshot`：

```typescript
// staged
{totalChangesStats?.staged ?? snapshot?.staged.length ?? 0}

// unstaged (modified) 
{totalChangesStats?.unstaged ?? snapshot?.unstaged.length ?? 0}

// untracked
{totalChangesStats?.untracked ?? snapshot?.untracked.length ?? 0}
```

### 4. 传递参数链路

- `ChangesPanel.tsx` → 计算 `totalChangesStats` 并传递给 `ChangesTreePanel`
- `ChangesTreePanel.tsx` → 接收 `totalChangesStats` 并传递给 `ChangesToolbar`
- `ChangesToolbar.tsx` → 使用 `totalChangesStats` 显示合计

## 关键文件变更

| 文件 | 变更内容 |
|------|---------|
| `ChangesPanel.tsx` | 新增 `totalChangesStats` 计算并传递 |
| `ChangesTreePanel.tsx` | 新增 `totalChangesStats` 属性并传递 |
| `ChangesToolbar.tsx` | 新增 `totalChangesStats` 接口并使用 |

## 验证结果

✅ TypeScript 类型检查通过  
✅ 183 个前端测试全部通过

> 经验教训已迁移至 [knowledge-base/multi-workspace/stats-fix.md](../../knowledge-base/multi-workspace/stats-fix.md)
