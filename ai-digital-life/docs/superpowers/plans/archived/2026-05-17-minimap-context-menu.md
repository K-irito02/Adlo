# Minimap 右键菜单重新设计 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Minimap 右键菜单从旧版勾选 + 圆角样式重构为极简线条风（下划线分段控件 + `::before` 左侧竖线指示器 + 直角背景 + 底色高亮选中 + 中文标签）

**Architecture:** 仅涉及 2 个文件：`cmMinimap.ts`（组件逻辑 + 标签文字）和 `regions.css`（样式完全重写）。无新增文件，无新增依赖，无后端变更。

**Tech Stack:** React 19 + TypeScript + CodeMirror 6 + CSS 变量（系统主题）

---

### Task 1: 重写 CSS 样式（regions.css）

**Files:**
- Modify: `frontend/src/styles/regions.css` (lines 5883-5962)

- [ ] **Step 1: 替换右键菜单样式**

将以下 CSS 替换：

```css
.adl-cm-minimap-context-menu {
  position: fixed;
  padding: 6px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-raised);
  box-shadow: 0 4px 20px rgba(0,0,0,0.06);
  z-index: calc(var(--z-popover) + 10);
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 196px;
}

.adl-cm-minimap-menu-segmented {
  display: flex;
  gap: 0;
  margin: 0 6px 4px;
  border-bottom: 1px solid var(--border-subtle);
}

.adl-cm-minimap-menu-segmented__button {
  flex: 1;
  min-width: 0;
  padding: 7px 0 5px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.adl-cm-minimap-menu-segmented__button:hover:not([aria-pressed="true"]) {
  color: var(--text-secondary);
}

.adl-cm-minimap-menu-segmented__button[aria-pressed="true"] {
  color: var(--text-primary);
  border-bottom-color: var(--text-primary);
}

.adl-cm-minimap-menu-group-label {
  padding: 8px 12px 3px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.adl-cm-minimap-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  font-size: var(--text-xs);
  cursor: pointer;
  position: relative;
}

.adl-cm-minimap-menu-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: transparent;
  transition: background 0.1s;
}

.adl-cm-minimap-menu-item:hover {
  background: var(--surface-hover);
}

.adl-cm-minimap-menu-item:hover::before {
  background: var(--border);
}

.adl-cm-minimap-menu-item--active {
  background: var(--surface-active);
  font-weight: 500;
}

.adl-cm-minimap-menu-item--active::before {
  background: var(--text-primary);
}

.adl-cm-minimap-menu-separator {
  height: 1px;
  background: var(--border-subtle);
  margin: 3px 6px;
}
```

还需在主题 CSS 文件中确保 `--surface-active` 变量存在，或使用硬编码值。检查项目主题变量。

- [ ] **Step 2: 运行类型检查**

Run: `npm --prefix frontend run typecheck`
Expected: PASS（CSS 不改类型）

---

### Task 2: 修改组件逻辑（cmMinimap.ts）

**Files:**
- Modify: `frontend/src/app/regions/right-panel/cmMinimap.ts`

- [ ] **Step 1: 修改分段控件标签**

将第 1268-1275 行的两个按钮 label：
```diff
- createModeButton("滑动条: Minimap", ...)
+ createModeButton("缩略图", ...)
- createModeButton("滑动条: 普通", ...)
+ createModeButton("标准", ...)
```

- [ ] **Step 2: 修改菜单项标签文字（去前缀 + 中文）**

在内联项目区域（第 1176-1218 行）修改：
```diff
- label: "渲染字符",
+ label: "渲染字符",
  // 不变
- label: "缩放: 50%",
+ label: "50%",
- label: "缩放: 100%",
+ label: "100%",
- label: "缩放: 150%",
+ label: "150%",
- label: "缩放: 200%",
+ label: "200%",
- label: "宽度: 60px",
+ label: "60px",
- label: "宽度: 80px",
+ label: "80px",
- label: "宽度: 100px",
+ label: "100px",
- label: "宽度: 120px",
+ label: "120px",
```

在第 1224-1231 行的 sliderProminence 区域：
```diff
- label: "滑块样式: 轻",
+ label: "明显",
- label: "滑块样式: 标准",
+ label: "正常",
```

- [ ] **Step 3: 添加分组标题标签**

在 `getMenuItems()` 返回的数组中，在各组之间插入 `{separator: true}`（用于生成分组标题），并新增分组元素的创建逻辑。

修改 `renderMenuContent()`，在分组前插入分组标题 div 元素。

`createGroupLabel(text)` 工具函数：
```typescript
const createGroupLabel = (text: string) => {
  const el = document.createElement("div");
  el.className = "adl-cm-minimap-menu-group-label";
  el.textContent = text;
  return el;
};
```

在渲染循环中，在 renderCharacters 前插入 "显示" 分组标签，在 zoom 前插入 "缩放"，在 width 前插入 "宽度"，在 sliderProminence 前插入 "滑块突出"。

注意：`getMenuItems()` 返回的 items 是纯数据（MenuItem[]），分组标签需要在 `renderMenuContent()` 中根据位置动态插入。

分组插入逻辑：
```typescript
// 在渲染字符前
menu.appendChild(createGroupLabel("显示"));
// 在缩放列表前
menu.appendChild(createGroupLabel("缩放"));
// 在宽度列表前（仅 minimap 模式有宽度项）
menu.appendChild(createGroupLabel("宽度"));
// 在滑块突出前
menu.appendChild(createGroupLabel("滑块突出"));
```

更好的方式：把分组标题作为特殊 menuItem 类型处理，新增 `"group"` 类型。

修改 MenuItem 类型：
```typescript
type MenuItem = { label: string; checked: boolean; onClick: () => void; separator?: boolean; group?: boolean };
```

在 `getMenuItems()` 中插入分组伪元素：
```typescript
// 在渲染字符前加 group label
{ label: "显示", checked: false, onClick: () => {}, group: true },
```

在 `renderMenuContent()` 中处理 group：
```typescript
if (item.group) {
  const el = document.createElement("div");
  el.className = "adl-cm-minimap-menu-group-label";
  el.textContent = item.label;
  menu.appendChild(el);
  continue;
}
```

- [ ] **Step 4: 移除 checkmark，改为 active 类名**

移除 checkmark span 及 logic：
```diff
- const check = document.createElement("span");
- check.className = "adl-cm-minimap-menu-item__check";
- check.textContent = item.checked ? "√" : "";
- el.appendChild(check);
```

将 class 切换：
```diff
- el.className = `adl-cm-minimap-menu-item${item.checked ? " adl-cm-minimap-menu-item--checked" : ""}`;
+ el.className = `adl-cm-minimap-menu-item${item.checked ? " adl-cm-minimap-menu-item--active" : ""}`;
```

- [ ] **Step 5: 调整菜单高度计算**

```diff
  const menuHeight = 42 + items.filter(i => !i.separator).length * 28 + items.filter(i => i.separator).length * 8 + 16;
+ // 菜单高度计算 + 分组标题额外空间。分组标题高度约 20px。
+ const groupCount = items.filter(i => i.group).length;
+ const menuHeight = 42 + items.filter(i => !i.separator && !i.group).length * 28 + items.filter(i => i.separator).length * 8 + groupCount * 20 + 16;
```

- [ ] **Step 6: 运行类型检查**

Run: `npm --prefix frontend run typecheck`
Expected: PASS

---

### Task 3: 验证

- [ ] **Step 1: 运行前端测试**

Run: `npm --prefix frontend test`
Expected: PASS

- [ ] **Step 2: 运行端到端验证**

Run: `npm run dev:browser`
在浏览器中右键点击 Minimap 区域，验证：
1. 分段控件显示「缩略图 / 标准」，下划线样式
2. 选项背景为直角
3. 悬停时左侧出现竖线
4. 选中项有底色高亮 + 左侧竖线
5. 深色主题下颜色正确
6. 切换系统深色/浅色主题，样式正确
