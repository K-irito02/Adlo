# GitHub "删除全部" 菜单行为与 "!" 子卡片规范

## 背景

GitHub CI 面板顶部的"删除全部新建目录/配置/数据"菜单存在以下交互问题：
1. 悬停在按钮上显示菜单后，鼠标离开按钮但移到菜单之前，菜单消失 → 用户根本点不到
2. 鼠标离开菜单时，在某些位置未能正确触发关闭 → 菜单残留
3. 菜单按钮上有重复的 tooltip 提示（与按钮文字相同）→ 干扰操作
4. 菜单项右侧的 "!" 提示卡片在某些入口不显示或依赖不准确的选择器

## 关键模式：relatedTarget + 延迟关闭

### 基本思路

使用一对 `onMouseEnter` / `onMouseLeave` 处理**按钮**和**菜单**两个元素的交互。判断鼠标去向（`event.relatedTarget`）是否落在"按钮 ∪ 菜单"集合内，决定是否开始关闭倒计时。

### 状态机

```
deleteMenuOpen: boolean     ← 菜单显示状态
deleteButtonRef: ref        ← 按钮 DOM 引用
deleteMenuRef: ref          ← 菜单 DOM 引用
deleteCloseTimerRef: ref    ← 关闭定时器（180ms）

isInsideDeleteUI(node)     ← 判断节点是否在按钮或菜单内
scheduleDeleteMenuClose()  ← 启动 180ms 关闭倒计时（可取消）
cancelDeleteMenuClose()    ← 清除关闭倒计时
```

### 事件处理矩阵

| 元素 | 事件 | 逻辑 |
|------|------|------|
| 删除按钮 | `onMouseEnter` | 取消关闭 + `setDeleteMenuOpen(true)` |
| 删除按钮 | `onMouseLeave` | 如果 `relatedTarget` 不在按钮∪菜单内，启动 180ms 关闭 |
| 菜单容器 | `onMouseEnter` | 取消关闭（鼠标已进入安全区） |
| 菜单容器 | `onMouseLeave` | 如果 `relatedTarget` 不在按钮∪菜单内，启动 180ms 关闭 |
| 菜单项点击 | - | `setDeleteMenuOpen(false)` + 执行对应 action |

### 全局兜底

即使鼠标事件处理逻辑正确，也存在用户在页面其他区域点击而菜单残留的风险。因此额外注册全局 `mousedown` 监听器：

- 当 `deleteMenuOpen === true` 时生效
- 点击目标不在按钮也不在菜单内 → 直接关闭
- 组件卸载或菜单关闭时移除监听器

### 为什么不是 CSS `:hover`

`:hover` 伪类的问题：
1. 按钮与菜单是两个独立 DOM 节点，之间的视觉间隙会导致鼠标移动时失去 hover
2. hover 状态由浏览器管理，React 无法在渲染循环中精确感知
3. 无法给"从按钮到菜单的短暂过渡时间"这一语义建模

显式 state + `relatedTarget` 检查才是可控方案。

## "!" 子卡片显示机制

### 组件：`MenuHintItem`

每个菜单项由 `label + hint` 两部分组成，渲染为：

```
<button.adl-multitree-entry__menu-item>
  <span>{label}</span>
  <span.adl-menu-item__hint onMouseEnter={...} onMouseLeave={...}>
    !
  </span>
</button>
```

### 子卡片 DOM 结构

子卡片由 3 个独立的 `position: fixed` 元素组成（渲染到 `document.body`，不在按钮 `z-index` 链中）：

| 元素 | className | 作用 |
|------|-----------|------|
| 卡片主体 | `.adl-sub-hint-card` | 提示文本容器，右边缘紧贴主菜单右边界 |
| 箭头填充 | `.adl-sub-hint-card__arrow` | 指向左侧的三角形（内部色） |
| 箭头边框 | `.adl-sub-hint-card__arrow-border` | 三角形外轮廓（与边框同色） |

### 定位算法

```
buttonRect = hintButton.getBoundingClientRect()
menuCard   = querySelector(`[data-menu-id="${menuId}"]`)  ← 优先使用传入 id
            或 querySelector(`[data-menu-id="github-delete-all-menu"]`) ← 兜底
            或 querySelector(`[data-menu-id^="github-"]`) ← 更宽松兜底
menuRect = menuCard.getBoundingClientRect()

centerY = buttonRect.top + buttonRect.height / 2

card.left = menuRect.right + 1      ← 紧贴菜单右边，1px 间距
card.top  = centerY                  ← 垂直居中于按钮中心
arrow.left = menuRect.right - 4      ← 左箭头指向菜单
arrow.top  = centerY - 4
```

### 关键依赖：`data-menu-id`

菜单容器**必须**设置 `data-menu-id` 属性，否则 `MenuHintItem` 的 `querySelector` 返回 `null`，子卡片无法定位。

顶部"删除全部"菜单使用：`data-menu-id="github-delete-all-menu"`

### 子卡片的交互约束

子卡片的 CSS 中设置了 `pointer-events: none`，含义：
- 鼠标在子卡片上移动不会触发 hover、click 等事件
- 鼠标从 `!` 移动到子卡片的瞬间，`onMouseLeave` 的 `relatedTarget` 也**不会**指向子卡片
- 因此主菜单的关闭逻辑必须处理"鼠标进入子卡片"这一状态

当前实现策略：**子卡片不参与主菜单关闭逻辑的判定**。即鼠标从 `!` 离开到任何位置时，直接移除子卡片。主菜单的关闭由顶部菜单自己的 `relatedTarget` 判定控制。

这形成的用户体验是：鼠标从主菜单区域移到 `!` → 子卡片弹出 → 鼠标离开 `!` → 子卡片立即消失，同时主菜单根据 180ms 倒计时决定是否消失。

## tooltip 去除规则

顶部工具栏的"删除全部"按钮**不得**使用 `TooltipSimple` 或任何 tooltip 包装：
- 按钮上已有明确的图标 + `aria-label`
- tooltip 与将要展开的菜单视觉重叠，造成干扰
- 用户悬停时最优先的反馈应该是"菜单展开"而非"tooltip 提示"

任何仅在按钮上重复已有信息的 tooltip 都应考虑去除。

## 完整代码接口参考

```tsx
// GitHubPanel.tsx 中的关键接口
const deleteButtonRef = useRef<HTMLButtonElement>(null);
const deleteMenuRef = useRef<HTMLDivElement>(null);
const deleteCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const isInsideDeleteUI = (node: EventTarget | null) => boolean;
const scheduleDeleteMenuClose = () => void;    // 180ms 后关闭
const cancelDeleteMenuClose = () => void;      // 取消倒计时

// 菜单必须设置 data-menu-id，供 MenuHintItem 定位
<div
  ref={deleteMenuRef}
  data-menu-id="github-delete-all-menu"
  onMouseEnter={() => cancelDeleteMenuClose()}
  onMouseLeave={(e) => { if (!isInsideDeleteUI(e.relatedTarget)) scheduleDeleteMenuClose(); }}
>
  <MenuHintItem label="..." hint="..." onClick={...} menuId="github-delete-all-menu" />
</div>
```

## 反模式总结

| 反模式 | 问题 | 正确做法 |
|--------|------|---------|
| 仅用 CSS `:hover` 控制菜单显隐 | 按钮与菜单的间隙导致 hover 丢失 | 使用显式 state + 定时器 |
| `onMouseLeave` 不检查 `relatedTarget` | 鼠标离开按钮进入菜单瞬间触发关闭 | 检查 `relatedTarget` 落在按钮或菜单内 |
| 菜单容器缺少 `data-menu-id` | `MenuHintItem` 无法定位父菜单，子卡片不出现 | 所有弹出菜单必须设置唯一 `data-menu-id` |
| 关闭无延迟或延迟过长 | 无延迟导致根本点不到菜单；过长导致菜单残留 | 150–200ms 为合理区间 |
| 按钮上重复 tooltip | 与即将展开的菜单视觉冲突 | 去除 tooltip，保留 aria-label |

## "!" 图标悬停背景覆盖与菜单宽度自适应

### 问题

菜单位于通信面板 → GitHub 子面板的"删除全部"菜单中，功能选项右侧的 "!" 图标在以下场景出现问题：

1. **背景穿透**：悬停在菜单选项上但未悬停在 "!" 图标上时，"!" 图标区域显示了与按钮一样的灰色 hover 背景
2. **文字溢出**：标签文字延伸到 "!" 图标下方，在 "!" 图标 hover（半透明 `bg-hover`）时文字透出
3. **菜单撑宽**：菜单未自适应到能容纳完整标签文字

### 最终解决方案

保持 DOM 结构不变（"!" 图标仍在 `<button>` 内部），纯 CSS 处理：

```css
/* "!" 图标：绝对定位浮动在按钮之上，bg-card 遮盖按钮 hover 灰色 */
.adl-menu-item__hint {
  position: absolute;
  right: var(--space-1);
  top: 50%;
  transform: translateY(-50%);
  background: var(--bg-card);
  z-index: 1;
}

/* 标签 span：预留图标宽度，不参与按钮 hover */
.adl-multitree-entry__menu-item > span:first-child {
  overflow: visible;
  white-space: nowrap;
  flex-shrink: 0;
  margin-right: 16px;          /* 为绝对定位的 "!" 图标预留宽度 */
}

/* 菜单按钮：取消 width:100%，由父 flex column 的 align-items:stretch 拉伸 */
.adl-multitree-entry__menu-item {
  display: flex;
  align-items: center;
  /* 无 width: 100% */
}
```

### 关键原理

| 层面 | 原理 |
|------|------|
| **背景遮盖** | "!" 图标 `position: absolute` + `background: var(--bg-card)` + `z-index: 1` 浮在按钮之上，用不透明菜单背景色盖住按钮的 `var(--bg-hover)` |
| **宽度预留** | `margin-right: 16px` 在标签 span 右侧留出 16px（"!" 图标宽度），该空间计入 `max-content` 计算，菜单正确撑宽 |
| **菜单撑宽** | 去掉按钮 `width: 100%`，利用 flex column 的 `align-items: stretch`（默认值）自动拉伸所有按钮到最宽按钮的宽度 |
| **图标右调** | `right: var(--space-1)`（~4px）替代原 `var(--space-3)`（8px），使图标更靠近菜单右边缘 |

### 陷阱记录：CSS 钻石依赖

`.adl-multitree-entry__menu-item` 在 **两个 CSS 文件** 中均有定义：

```
files-panel.css → file-operations.css  (.menu-item: 修改版)
rightpanel.css  → file-tree.css        (.menu-item: 旧版 width:100%)
```

`file-tree.css` 后加载，其 `width: 100%` 覆盖了 `file-operations.css` 中已移除的同属性。修复时必须同时修改两个文件。

### 调试线索

- 悬停 "!" 图标时文字完整显示 → 说明标签文字未被 `overflow` 截断，而是被图标背景遮盖
- `bg-hover` 为半透明色时，图标 hover 会透出下方文字
- 正确间距：`margin-right: 16px` = 图标宽度 16px
