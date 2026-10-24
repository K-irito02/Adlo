# 中心标签条 / 标题栏 / 终端工具栏调整与「卷帘门」裁剪复用模式（2026-10-04）

## 背景

中心（中心标签条）与右侧面板终端工具栏的一批 UI 调整：标签等宽、长名「卷帘门」裁剪 + 悬停遮挡、
选中灰底与相邻未选中标签中段分割线、点击后悬停按钮常驻修复、终端标签双击重命名、工具栏高度对齐
右侧导航栏、复合按钮窄宽下下箭头恒可见与名称省略、右侧按钮贴边与右面板对称内缩。

## 关键根因（均实际定位，非猜测）

1. **作用域 CSS 变量未定义 → 「选中/悬停无底色」**：`.adl-center-tab.is-active/:hover` 引用了仅在树行
   选择器组上定义的 `--adl-tree-row-active-bg / --adl-tree-row-hover-bg`，在标题栏作用域解析为无效值
   → 实际透明。改用全局 `--bg-active / --bg-hover` 修复。**教训**：引用 CSS 变量前先确认其定义作用域
   覆盖消费点；同一批样式文件里「看似可用」的变量常是局部定义。
2. **`:focus-within` 使鼠标点击后按钮常驻**：中心标签 `tabIndex=0`，点击后 `:focus-within` 持续命中操作
   按钮显隐规则。改为 `:focus-visible` / `:has(:focus-visible)`（保留键盘可达性，`file-tree-core.css` 等
   已有 `:has()` 先例）。
3. **`TooltipSimple` 包裹层才是真正的 flex 子项**：按钮被 `.tooltip-trigger`（span，`display:inline-flex`）
   包裹，该 span 默认 `min-width:auto` 阻止收缩 → 复合按钮在窄宽下把下箭头挤出并被 pill 的 `overflow:hidden`
   裁剪。放开包裹层 `min-width` 并把下箭头改绝对定位（锁定在 toggle 右侧 padding 区）后恒可见。
   **教训**：调试收缩/DOM 几何时以**实际 flex 子项**为准——用调试日志打印各层 rect + computed style，
   不要凭组件结构推断（本次靠 `[ADL-DEBUG]` 的 rect/样式输出才发现包裹层问题）。
4. **类名复用导致规则误伤**：为复合按钮加的 `.adl-file-context__menu{min-width:64px}` 同时命中同名的
   「更多操作」下拉容器（`TerminalMenuDropdown`），把它撑宽、按钮被挤到左侧留下右空隙。用
   `:has(.adl-split-pill)` 精确限定「复合按钮载体」。

## 可复用模式

- **`.adl-clip-tab*`（卷帘门式标签 + 悬停遮挡）**：单行硬裁剪（`text-overflow:clip`，不显示省略号），
  悬停/键盘聚焦时名称右端被绝对定位操作组遮挡并做 `mask-image` 雾感渐隐；遮挡宽度由
  `--adl-clip-tab-cover / --adl-clip-tab-blend` 微调。中心标签条与右侧终端标签条共用
  （`components/tab-clip.css`）。
- **`.adl-clip-x`（响应式单行裁剪）**：`display:block; min-width:0; overflow:hidden; white-space:nowrap;
  text-overflow:clip`。用于自适应布局中可能被 flex 压缩的文本：容器变窄时内容从右端渐进裁切消失，
  而非换行、撑高或与相邻元素重叠。**这是本项目「响应式/自适应布局」的推荐策略**——优先让文本卷帘门
  裁剪，避免按钮变形或相互重叠。
- **`useTabTitleRename`（共享内联重命名 hook）**：中心标签条与右侧终端标签条共用同一份
  「编辑态 + trim 提交 + Escape 取消 + 聚焦全选」语义，避免两处实现漂移（`app/hooks/useTabTitleRename.ts`）。

## 其他经验

- **悬停遮挡与按钮显隐必须同源**：若两者用不同条件（一处 `:hover`、一处 `:has(:focus-visible)`），
  触屏/键盘下会出现「名被遮而按钮不可见」的错位。补 `.adl-tool-list__item:has(:focus-visible)
  .adl-tool-list__item-close{opacity:1}` 使其同步。
- **长名截断用 CSS 宽度驱动而非 JS 字符数**：由 `max-width + text-overflow:ellipsis` 决定，行为随容器
  连续变化；可见截断与可访问名分离（`aria-label` 补全完整名称，触屏无 tooltip 时仍可获知）。
- **高度对齐口径**：右侧「面板切换导航栏」高 = 30px 按钮 + 1px 底边 = 31px；中心工具栏 `min-height:31px`
  （`border-box` 已含 1px 底边）与之一致。
- **作用域隔离**：终端工具栏的收缩/下限规则须限定 `:not(.adl-center-terminal)`，避免波及中心终端
  （其 `--grow` 是空占位组）；中心视图的覆盖统一用 `.adl-center-*` 前缀，右侧面板不受影响。

## 相关

- 根因档案：`progress-2026-10-04-145855.md`（原文已归档）
- 代码：`frontend/src/styles/components/tab-clip.css`、`frontend/src/styles/utilities.css`、
  `frontend/src/app/hooks/useTabTitleRename.ts`、`frontend/src/app/regions/CenterTabStrip.tsx`
