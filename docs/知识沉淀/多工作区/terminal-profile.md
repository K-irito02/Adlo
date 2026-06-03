# 终端工作区默认终端类型功能修复 — 经验教训

> 日期: 2026-05-27

## 问题概述

修复工作区头部"更多操作"菜单的子菜单功能，包括：
1. 点击子菜单项无效
2. UI 不更新
3. 刷新后设置丢失
4. 菜单布局不稳定

## 根本原因分析

### 1. Portal 渲染菜单系统的点击处理

**问题**：React Portal 渲染的菜单系统，使用 `document.querySelector` 检查点击区域时，只检查了主菜单元素，未检查子菜单元素。

**症状**：点击子菜单项时，`handleClickOutside` 函数先触发并关闭菜单，导致子菜单项的 `onClick` 事件无法执行。

**解决方案**：
```typescript
const handleClickOutside = (e: MouseEvent) => {
  const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`);
  const subMenuEl = document.querySelector(`[data-menu-id="${subMenuId}"]`); // 新增
  if (menuEl?.contains(target)) return;
  if (subMenuEl?.contains(target)) return; // 新增
  setMenuOpen(false);
};
```

### 2. Zustand + React 状态同步

**问题**：`useCallback` 闭包捕获的状态可能是旧值。

**解决方案**：
```typescript
// 使用 getState() 获取最新值
const handleCreateTab = useCallback(async () => {
  const { workspaceDefaultProfiles } = useAppStore.getState();
  // ...
}, []);
```

### 3. localStorage 持久化延迟

**问题**：`scheduleWrite` 使用 `requestIdleCallback` 延迟写入，用户可能在写入执行前刷新页面。

**解决方案**：
```typescript
setWorkspaceDefaultTerminalProfile: (workspaceId, profile) => {
  set((state) => {
    const nextWorkspaceProfiles = { ...state.workspaceDefaultProfiles, [workspaceId]: profile };
    // 同步写入（确保持久化）
    try {
      window.localStorage.setItem(KEY, JSON.stringify(nextWorkspaceProfiles));
    } catch { /* ignore */ }
    // 延迟写入用于批量优化
    scheduleWrite(KEY, nextWorkspaceProfiles);
    return { workspaceDefaultProfiles: nextWorkspaceProfiles };
  });
},
```

### 4. CSS 样式覆盖

**问题**：同一个类可能在多个 CSS 文件中定义，导致修改不生效。

**发现**：
- `.adl-multitree-entry__menu` 在 `file-tree.css` 和 `files-panel.css` 中都有定义
- `files-panel.css` 中的定义使用了 `min-width`，覆盖了 `file-tree.css` 中的固定 `width`

**解决方案**：
- 修改所有定义该类的文件
- 使用 `width: 176px` 替代 `min-width: 176px` 固定宽度

### 5. Flexbox 布局稳定性

**问题**：使用 `justify-content: space-between` 时，箭头图标位置会受文本宽度影响。

**解决方案**：
```css
.adl-multitree-entry__menu-item--with-sub {
  display: flex;
  align-items: center;
}

.adl-multitree-entry__menu-item-content {
  flex: 1; /* 占据剩余空间 */
  overflow: hidden;
  text-overflow: ellipsis;
}

.adl-multitree-entry__menu-item-arrow {
  flex-shrink: 0;
  margin-left: auto; /* 固定在右侧 */
}
```

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `terminalSlice.ts` | 同步 localStorage 写入 |
| `WorkspaceTerminalEntry.tsx` | 子菜单点击检查、菜单保持打开、箭头图标结构 |
| `useTerminalPanel.ts` | 使用 getState() 获取最新值 |
| `file-tree.css` | 固定菜单宽度、箭头图标布局 |
| `files-panel.css` | 固定菜单宽度、箭头图标布局 |

## 经验教训

1. **Portal 渲染组件**：需要同时检查所有相关元素的点击区域
2. **Zustand 状态**：关键操作使用 `getState()` 获取最新值
3. **localStorage**：关键数据同步写入，批量优化作为补充
4. **CSS 样式**：修改前先搜索所有定义该类的文件
5. **Flexbox 布局**：
   - 使用 `margin-left: auto` 固定元素在右侧
   - 使用 `flex-shrink: 0` 防止元素被压缩
   - 使用 `flex: 1` 让元素占据剩余空间
   - 使用 `overflow: hidden` + `text-overflow: ellipsis` 处理文本溢出

## 测试验证

- cargo test: 102 测试通过
- 前端测试: 183 测试通过
- 类型检查: 无错误
