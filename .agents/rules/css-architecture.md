---
description: CSS architecture rules, splitting thresholds, dead CSS prevention, and layout stability
alwaysApply: false
---

# CSS 架构规范

## 文件组织
- CSS 文件按 UI 区域拆分：`regions/`、`components/`、`features/` 各司其职
- 单个 CSS 文件 > 1000 行：必须按子区域或组件进一步拆分
- 全局变量和基础样式放在 `src/styles/`：`index.css`、`variables.css`、`reset.css`
- 组件专属样式放在组件同目录或 `features/{domain}/` 对应目录

## 变量与 Token
- 所有颜色使用 `var(--...)` CSS 变量，禁止硬编码 hex/rgb
- 间距使用 `var(--space-{n})`（4px 基准网格：0, 2, 4, 6, 8, 12, 16, 24, 32, 48）
- 新设计 Token 必须同时在 `design-system/tokens.ts` 中注册 TypeScript 类型
- 主题颜色变量必须定义在 `themes.css` 中，而非组件 CSS 文件。组件 CSS 仅通过 `var()` 引用主题变量，否则暗色主题无法自动切换

## 死 CSS 预防
- 删除组件时，必须同时搜索并删除其专属 CSS
- 定期（每 5 轮重构）扫描未使用的 CSS 类并清理
- 新组件优先使用已有工具类，避免重复定义

## CSS 钻石依赖预防
- 同一个 CSS 类名在两个及以上 CSS 文件中定义时，形成"钻石依赖"
- 后加载的文件会覆盖先加载的同优先级规则，导致修改一个文件后效果被另一个文件抵消
- 修复或修改共享类名时，必须搜索所有 CSS 文件中的同名定义，确保同步修改
- 共享类名优先定义在单一文件中，避免跨文件重复定义

## 布局稳定性
- 内容可能变化的容器使用固定 `width`，禁止仅设置 `min-width`
- 图标或徽标元素使用 `margin-left: auto` 固定在容器右侧，而非绝对定位
- 例外——提示图标（如 "!"）: 当需要图标浮动在按钮之上以遮盖按钮 hover 背景时，可使用 `position: absolute` + `background: var(--bg-card)` + `z-index: 1`，同时给标签元素等宽的 `margin-right` 以计入 `max-content` 计算
- 禁止对动态列表项使用不同的高度或间距（导致布局抖动）
- 占位/添加状态元素的 `border-width` 必须与真实元素一致（`box-sizing: border-box` 下边框厚度影响总尺寸），仅改变 `border-style` 为 `dashed` 即可视觉区分

## 绝对定位与悬停隔离
- 父级 `:hover` 背景会穿透绝对定位子元素（子元素背景透明时），导致子元素区域显示父级 hover 背景
- 如需隔离，给子元素显式设置遮罩背景（如 `var(--bg-card)`）+ `z-index` 以覆盖父级 hover 背景
- 子元素自身的 `:hover` 背景不受此限制，可直接设置

## 性能相关
- 超过 50 项的滚动列表：使用 `content-visibility: auto` 延迟渲染屏外内容
- 动画和过渡仅使用 `transform` 和 `opacity`，避免触发 layout/paint（使用 `will-change` 提示浏览器）
- 禁止使用 `*` 选择器或深度嵌套选择器（>3 层）

## CSS 文件加载顺序与去重
- 同一优先级的选择器在多个 CSS 文件中定义时，加载顺序靠后者覆盖前者
- 禁止在多个 CSS 文件中定义相同选择器的完整规则（`file-tree.css` 是树样式的唯一真源；`files-panel.css` 只应包含 `file-tree.css` 没有的面板级样式）
- 定期检查跨文件的选择器重复，移除死代码；未在 import 链中出现的 CSS 文件其内所有规则均为死代码

## 虚拟化树形列表的 CSS 模式

### 动态缩进（`--adl-tree-indent`）
虚拟化树的所有节点为扁平 `<li>`，通过 JS 在每个 `<li>` 上设置 `--adl-tree-indent: (depth-1)*14px` 实现层级感知：

```css
.adl-filetree__item::before {
  left: calc(18px + var(--adl-tree-indent, 0px));
}
.adl-filetree__row {
  padding-inline-start: calc(8px + var(--adl-filetree-hover-offset) + var(--adl-tree-indent, 0px));
}
```

### 树干线溢出（`--adl-trunk-height`）
老旧递归树使用 `::before { top: 0; bottom: 0 }` 跨越父 `<li>` 到达子项。虚拟化树改用溢出模式：

```css
.adl-filetree__item::before {
  height: var(--adl-trunk-height, 28px);
  bottom: auto;
}
```

JS 计算每个展开目录的 `--adl-trunk-height: (visibleDescendants + 1) * 28px`。文件节点隐藏 `::before`，树干线由父目录的溢出 `::before` 提供。

### 悬停传播（扁平列表限制）
CSS 兄弟选择器 `~` 无法跨越扁平列表的兄弟节点。目录悬停高亮传播必须通过 JS 计算：从悬停目录在 flatNodes 中的索引向后扫描，收集直到遇到 depth ≤ 悬停节点 depth 的项，后代节点获得 `is-hovered-by-ancestor` 类。

## 虚拟化列表的 CSS 要求

### 虚拟列表容器
```css
.adl-filetree-scroll {
  position: relative;
  overflow-y: auto;
  height: 100%;
}
.adl-filetree-scrollbar {
  /* 自定义滚动条叠加在内容上，不占布局空间 */
}
```

### 行高一致性
- 虚拟化列表的所有行必须使用固定高度
- 默认行高：28px（与 `useVirtualList` 的 `itemHeight` 参数一致）
- 禁止使用 `padding-top`/`padding-bottom` 变化导致行高不一致

### content-visibility 使用限制
- 50-200 项：`content-visibility: auto` 足够
- 200+ 项：必须使用虚拟化替代
- content-visibility 在某些浏览器下存在渲染 bug，优先使用虚拟列表

## 全宽悬停背景模式

当需要在卡片/容器内部的行元素上实现"背景延伸至卡片左右边缘"的悬停效果时，使用 `::after` 伪元素 + 局部层叠上下文模式：

```css
.row-element {
  position: relative;
  z-index: 0;  /* 创建局部层叠上下文 */
}
.row-element:hover {
  z-index: 1;  /* 避免被相邻行遮挡 */
}
.row-element:hover::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -Xpx;   /* = 父容器左侧所有 padding/margin 之和 */
  right: -Ypx;  /* = 父容器右侧所有 padding/margin 之和 */
  background: var(--surface-hover);
  z-index: -1;  /* 在局部上下文内为负：位于内容/::before 之后，但位于父容器背景之上 */
  pointer-events: none;
}
```

**注意**：
- 必须给父元素设置 `z-index: 0`（而非仅 `position: relative`），否则 `::after` 的 `z-index: -1` 在根层叠上下文中会绘制在普通流元素（含卡片背景）之后，导致背景不可见
- `left`/`right` 的负值必须累加从目标元素到卡片边界的全部 padding/margin
- `border-radius: 0` 确保直角延伸无缝隙
- 参考实现：`communication-panel.css` 中 `.adl-github-timeline__step:hover::after`

## 禁止项
- 禁止使用 `!important`（除非覆盖第三方库样式或浏览器伪元素如 `::-webkit-scrollbar`）
- 禁止硬编码颜色值（hex、rgb、hsl 等）
- 禁止在 CSS 中使用 `transition: all`
- 禁止超过 3 层的选择器嵌套

## `!important` 使用规范
- **可移除场景**：布局属性（`display`、`flex-direction`、`align-items`、`width`、`height`、`margin`、`padding`、`position` 等）的 `!important` 通常可通过提高选择器特异性替代
- **必须保留场景**：visibility 控制（`opacity` + `pointer-events` + `transition`）、浏览器特定属性（`scrollbar-width`、`-ms-overflow-style`）、伪元素覆盖（`::-webkit-scrollbar`）、视觉状态覆盖（hover/active 背景色、选中行颜色）
- 新增 `!important` 前应评估：能否通过父级选择器提高特异性？如 `.adl-panel .adl-row` 替代 `.adl-row`
