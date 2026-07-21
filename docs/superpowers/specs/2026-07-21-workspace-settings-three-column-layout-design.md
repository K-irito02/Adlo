# Workspace Settings 三竖排 + 变形/裁剪布局设计

## 问题

右侧面板"设置"→"工作区"中，三个列表（优先加载、延迟加载、工作区标签）垂直堆叠。跨列表拖拽标签时，`onDragOver` 实时移动数据导致列表高度变化，下方列表位置跳动，拖拽操作难以对准目标，视觉体验差。

## 方案

将三个列表从垂直堆叠改为**三列 CSS Grid 并排**，配合"变形/裁剪"响应式策略处理窄面板场景。

### 布局结构

```
.adl-settings-section--workspace
├── .adl-settings-row                          # maxConcurrent 输入（始终可见，不受裁剪影响）
└── .workspace-curtain                         # overflow: hidden — 卷帘裁剪发生于此
    └── .workspace-grid                        # display: grid, 3 columns
        ├── .adl-sortable-section[data-droppable="priority"]    # 优先加载列
        ├── .adl-sortable-section[data-droppable="deferred"]    # 延迟加载列
        └── .adl-sortable-section[data-droppable="natural"]     # 工作区标签列
```

### 不变的部分

| 模块 | 说明 |
|------|------|
| `useWorkspaceDnd.ts` | computeMove / findContainer / onDragOver / onDragEnd — 全部无需修改 |
| `WorkspaceSettingsTypes.ts` | ContainerId / DraggableWorkspace 类型不变 |
| `SortableWorkspaceList.tsx` | 组件签名不变，仅新增 `compact` prop |
| `@dnd-kit` config | DndContext / sensors / collision detection 不变 |

## 响应式策略：三阶段

使用 CSS Container Queries（`container-type: inline-size`），因为内容区宽度 = 右侧面板宽度 − 导航宽度，与视口无关。

### 🟢 完整阶段（内容区宽度 >420px）

| 属性 | 值 |
|------|-----|
| 列数 | 3 |
| 列宽 | `repeat(3, 1fr)` |
| 列间距 | 12px |
| 列标题 | 14px, 完整文本 |
| 描述文字 | 可见 |
| 信息按钮 | 可见 |
| 列表项内边距 | 6px 8px |
| 拖拽手柄 | 可见 |
| 移除按钮 | 可见（priority/deferred） |
| 名称 | 完整显示 |

### 🟡 变形阶段（260px ~ 420px）

渐进式压缩，按以下顺序触发（基于 `@container` 断点）：

#### @container (max-width: 420px)
- 隐藏 `.adl-sortable-section-desc` 描述文字
- 列间距 12px → 8px

#### @container (max-width: 360px)
- 列标题字号 14px → 12px
- 列表项内边距 6px 8px → 4px 6px
- 列内边距 8px → 6px

#### @container (max-width: 300px)
- 隐藏拖拽手柄（`.adl-sortable-handle`），hover 时显示
- 隐藏移除按钮（`.adl-sortable-remove`），hover 时显示
- 工作区名称省略截断（`text-overflow: ellipsis`）
- 名称元素添加 `title` 属性，hover 时系统原生 tooltip 显示完整名称

#### @container (max-width: 260px)
- 隐藏信息按钮（`.adl-sortable-section-title` 内的 info/tooltip 按钮）
- 列内边距 6px → 4px

### 🔴 裁剪阶段（内容区宽度 <260px）

- `grid-template-columns: repeat(3, minmax(80px, 1fr))` — 每列最小 80px
- 3 × 80px + 2 × 8px = 256px 是 grid 最小总宽
- 当内容区宽度 < 256px 时，grid 溢出父容器 `.workspace-curtain`
- `.workspace-curtain` 的 `overflow: hidden` 自然裁剪右侧溢出部分
- 视觉效果：右边界像"窗帘"一样从左向右遮住列内容
- 裁剪是渐进的列 → 列被覆盖，不是跳变消失
- DOM 节点和数据状态保留，扩宽面板时内容"露出来"

## 过渡动画

```css
.workspace-curtain {
  transition: width var(--duration-200) ease;
}
```

面板宽度连续变化时（用户拖拽 resize），裁剪边界平滑跟随。

## CSS 实现概要

### Container Query 注册

```css
.workspace-grid {
  container-type: inline-size;
  container-name: workspace-lists;
}
```

### 变形规则

```css
/* 420px 以下 */
@container workspace-lists (max-width: 420px) {
  .adl-sortable-section-desc { display: none; }
  .workspace-grid { gap: 8px; }
}

/* 360px 以下 */
@container workspace-lists (max-width: 360px) {
  .adl-sortable-section-title { font-size: 12px; }
  .adl-sortable-item { padding: 4px 6px; }
}

/* 300px 以下 */
@container workspace-lists (max-width: 300px) {
  .adl-sortable-handle,
  .adl-sortable-remove {
    display: none;
  }
  .adl-sortable-item:hover .adl-sortable-handle,
  .adl-sortable-item:hover .adl-sortable-remove {
    display: inline-flex;
  }
}

/* 260px 以下 —— 进入裁剪区 */
@container workspace-lists (max-width: 260px) {
  .adl-sortable-section-title .info-icon { display: none; }
}
```

### 卷帘裁剪

```css
.workspace-curtain {
  overflow: hidden;
}

.workspace-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(80px, 1fr));
  gap: 8px;
  container-type: inline-size;
  container-name: workspace-lists;
}
```

## 需要修改的文件

| 文件 | 改动 |
|------|------|
| `frontend/src/app/features/workspace-settings/WorkspaceSettings.tsx` | 包裹 `.workspace-curtain` + `.workspace-grid` 容器 |
| `frontend/src/styles/components/settings.css` | 新增 grid 样式、Container Query 规则、变形/裁剪规则、hover 显隐规则 |
| `frontend/src/app/features/workspace-settings/SortableWorkspaceList.tsx` | 在 `.adl-sortable-label` 上添加 `title={workspace.label}` 属性（供截断后原生 tooltip 显示完整名称） |
| `frontend/src/app/features/workspace-settings/SortableWorkspaceList.test.tsx` | 验证 `title` 属性是否正确传递 |
| `frontend/src/app/features/workspace-settings/useWorkspaceDnd.test.ts` | 无需修改（DnD 逻辑不变） |

> 所有变形/紧凑样式均通过 CSS Container Queries 实现，无需 JS prop 或状态控制。只有 `title` 属性需要一行 JS 改动。

## 边界情况

| 场景 | 行为 |
|------|------|
| 全部 50 个标签在"工作区标签"列 | 该列自然撑高，共享滚动容器，跨列拖拽不受影响 |
| 某列为空 | 显示紧凑空状态占位符（dashed border） |
| 面板极窄 + 导航展开（~136px 内容区） | 所有列被裁剪隐藏，仅 maxConcurrent 行可见 |
| 导航收起（~496px 内容区） | 完整三列布局 |
| 拖拽到被裁剪区域 | 无法拖到不可见的列，但用户可扩宽面板恢复可见 |
| 右侧面板 overlay 模式 | 不影响，Container Query 基于内容区实际宽度 |
| 国际化标题较长 | 变形阶段标题截断 + title tooltip 显示完整文本 |
| 热更新配置 | 无影响，纯 CSS + 组件 prop 变更 |

## 实现顺序

1. 添加 CSS 基础结构（grid 布局、Container Query 注册）
2. 修改 WorkspaceSettings.tsx 包裹新容器
3. 实现变形阶段的 CSS 规则
4. SortableWorkspaceList 添加 compact prop
5. 补充 `title` 属性到 `.adl-sortable-label`
6. 添加过渡动画
7. 更新测试
8. 手动验证各宽度下的响应效果
