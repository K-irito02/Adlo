# 拖拽落点反馈与抬起副本

> 适用范围：面板内列表/树的内部拖拽（书签目录、已打开标签页、右侧「文件」面板导航树）。不覆盖 HTML5 文件拖入。右侧「变更」面板**不支持**内部拖拽（只共享目录显示顺序）。

## 放入（Drop Into）

- 目标行铺一层中性淡色底，**不加描边、不外发光**；**四角直角**（`border-radius: 0`），不沿用行自身的圆角。
- 颜色按主题反转，不跟随强调色：
  - 暗色：`rgba(255, 255, 255, 0.16)`
  - 亮色：`rgba(0, 0, 0, 0.12)`
- 背景必须明显强于 hover（暗 8% / 亮 6%），否则会被误认为悬停。
- 非法目标只显示 `cursor: not-allowed`；不使用红色行、虚线框或 toast。

## 插入（Reorder Insert）

- 2px 两端渐隐线 + 柔光，不占布局：
  - `background: linear-gradient(90deg, transparent, line 12% 88%, transparent)`
  - `box-shadow: 0 0 8px glow`
- 线色与光晕同样主题反转（暗白/亮黑）。
- **层级**：插入线 `z-index: 10000`，高于抬起副本（9999）；放入高亮 `9997`，低于副本，避免把副本染色。
- **定位**：插入线放在 portal 到 `document.body` 的 fixed overlay 中，位置取目标行 `getBoundingClientRect()`；不要作为列表 flex 子项插入，否则 gap 会随落点抖动。
- 面板内容容器若带 `transform` / `will-change`，fixed 会以它为包含块；必须 portal 到 body 才能使用视口坐标。

## 抬起副本（Drag Ghost）

- 1:1 克隆被拖拽行/标题；原行保持原位，不淡出、不位移。
- 外观：无边框、`border-radius: var(--radius-sm)`（近直角）、不透明背景、三层阴影。
- 书签目录行：`translateY(-2px) scale(1.03)`。
- 文件导航树的树行：克隆整个 `<li>`（保留 `--adl-tree-indent` 缩进变量与行宽），并**取消 1.03 放大**（`.adl-browser-dnd-lift--tree` 只保留 `translateY(-2px)`）——整行宽的副本放大后会比侧栏宽、图标缩进也会与源行不一致。
- 阴影按主题：
  - 暗：`0 2px 4px .20 / 0 12px 28px .32 / 0 28px 56px .22`
  - 亮：`0 2px 4px .08 / 0 12px 28px .14 / 0 28px 56px .10`
- 副本 `pointer-events: none`，跟随光标；拖拽期间对起始行 `setPointerCapture`，结束后在 document 捕获层抑制一次 click/auxclick。
- 窗口 `blur`、`pointercancel`、组件卸载都要移除副本并清理 body class。

## 输入方式

- 桌面 WebView2 默认 `dragDropEnabled: true` 会拦截 HTML5 DnD；内部拖拽统一使用 Pointer Events（4px 阈值 + `elementFromPoint`），保留原生文件/文件夹拖入。
- CSS 文本断言不能验证实际视觉；亮暗主题需读取 `getComputedStyle`。
