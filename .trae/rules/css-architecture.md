---
description: CSS architecture rules, splitting thresholds, dead CSS prevention, and layout stability
globs: ai-digital-life/frontend/**/*.css
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

## 生成式样式表与构建期内联（第三方主题适配）

适配第三方主题（如 `github-markdown-css`）时，**不要把官方 CSS 原样引入再逐主题换文件**——换文件意味着取数 + 解析，切换瞬间旧样式已卸、新样式未到，必然闪烁/拖慢（实测三轮弯路：按需 `<link>` 换 href → 预载 + 翻 `disabled`（`disabled` 表不取数，等于没预载）→ 构建期内联 + 双槽换文本）。约定做法：

- **变量驱动单表**：把颜色逐槽参数化为 `--md-*` 之类变量，多套配色只给多组变量定义；切换只翻容器属性（如 `data-md-theme`），纯变量重算、同一任务内完成、零取数零 FOUC。
- **生成器 + 自校验 + 精确 pin**：写脚本从上游包生成该单表（产物首行标注 `GENERATED FILE — 请勿手改` 与再生成命令，源脚本与产物都入库）；脚本内置自校验（值级比对、映射键存在性、发射选择器形态），`package.json` 对上游**精确 pin**（不带 `^`）以免小版本静默漂移。参考：`frontend/scripts/generate-md-theme-vars.mjs`。产物必须加入 `.prettierignore`（格式化会改写引号/前导零，造成产物与生成器漂移），并由 `pnpm gen:check`（重跑生成器 + `git diff --exit-code`）在 CI 校验一致性。
- **构建期 `?inline` 注入**：产物以 `?inline` 作为模块字符串于首次挂载注入 `<style>`（`el.textContent = css`，勿用 `innerHTML` 以免 `</style>` 破出），避免运行时额外请求；需 CSP 允许 `style-src 'unsafe-inline'`（本项目已允许）；注入用 `useLayoutEffect` 以免首帧无样式。
- **同元素限定覆盖**：容器常为同一元素多 class，覆盖规则必须写成 `.markdown-body[data-md-theme=x] h1`（同元素属性限定）；**不能**写成 `.adl-markdown-preview[data-md-theme=x] .markdown-body h1`（后代组合恒不命中，且两族色值巧合相等时会「零视觉症状」地失效）。
- 应用自身 chrome 的主题仍走 `themes.css` 语义 token；预览类第三方主题是**独立轴**（亮暗分组跟随应用主题），不与应用 token 混用。

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
- 参考实现：暂缺（原 `communication-panel.css` 示例已随通信面板删除）；新增同类实现时须按本节三条约束自证（层叠上下文、负值累加、直角无缝隙）

## 对话框按钮组防溢出（长文案语言）

英文等长文案语言下，确认对话框按钮组单行总宽易超过定宽对话框内宽（如 400px 框 vs EN 三键约 430px+，2026-09-29 迁移对话框事故）。
新写/改动对话框按钮组时必须同时满足：

```css
.adl-confirm-dialog {
  box-sizing: border-box;
  width: min(480px, calc(100vw - 32px));
  max-width: min(480px, calc(100vw - 32px));
}
.adl-confirm-dialog__footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap; /* 长文案换行收进容器，禁止溢出到框外 */
}
.adl-confirm-dialog__footer .adl-btn {
  min-width: 0;
  max-width: 100%; /* 单个超长按钮也不撑破对话框；不做截断省略 */
}
```

- footer 内的非按钮提示（如浏览器模式 `<small>`）必须用语义类（如 `.adl-confirm-dialog__hint`）独占一行，禁止裸元素选择器全局耦合
- `--fill` 用法必须带基类（`adl-prompt-modal__actions adl-prompt-modal__actions--fill`），否则吃不到按钮防超宽守卫
- 回归测试钉住 `flex-wrap` + 宽度上限 + 按钮守卫（见 `frontend/src/styles/workspace-settings.test.ts` 同名用例）

## 禁止项
- 禁止使用 `!important`（除非覆盖第三方库样式或浏览器伪元素如 `::-webkit-scrollbar`）
- 禁止硬编码颜色值（hex、rgb、hsl 等）
- 禁止在 CSS 中使用 `transition: all`
- 禁止超过 3 层的选择器嵌套

## `!important` 使用规范
- **可移除场景**：布局属性（`display`、`flex-direction`、`align-items`、`width`、`height`、`margin`、`padding`、`position` 等）的 `!important` 通常可通过提高选择器特异性替代
- **必须保留场景**：visibility 控制（`opacity` + `pointer-events` + `transition`）、浏览器特定属性（`scrollbar-width`、`-ms-overflow-style`）、伪元素覆盖（`::-webkit-scrollbar`）、视觉状态覆盖（hover/active 背景色、选中行颜色）
- 新增 `!important` 前应评估：能否通过父级选择器提高特异性？如 `.adl-panel .adl-row` 替代 `.adl-row`
