# 中心标签条：grid 隐式列撑爆 + 拖拽排序模式

日期：2026-10-09｜来源：标题栏标签溢出右裁、标签拖拽排序（B·滑动让位）

## 一、grid 隐式 auto 列被 min-content 撑爆（真根因曾误判）

症状：10 个标签时标题栏右端整体被右边缘裁剪，且下方内容区同步右移。
DevTools 实测：视口 1280，`HEADER.adl-titlebar` 宽 1405——元素本身被撑宽，
内部 flex 再怎么锁也救不了（初版修标题栏内部分配，实测无效）。

链条：`.adl-shell` 只写了 `grid-template-rows`、没写列 → 唯一隐式列为
`auto` → 标签不换行标题的 min-content（约 1405）把轨道撑出视口 →
`overflow:hidden` 在 1280 处裁掉右端。

修复（三处缺一不可）：shell 加 `grid-template-columns: minmax(0, 1fr)` 卡轨道；
`.adl-titlebar`、`.adl-shell__body` 加 `min-width: 0`（grid item 默认
`min-width: auto` 会用 min-content 把轨道再顶开，与 `.adl-center` 既有做法一致）。

教训：先锁内部、后查外层——flex 压缩与 grid 轨道撑爆症状相似，
以元素实测宽度（而非推测）定层级。

## 二、拖拽排序实现模式（Pointer Events + 单写 store）

- 不用 HTML5 DnD（做不出实时让位），用 Pointer Events 自定义：
  整标签按住、移动超阈值（4px，阈值内仍为单击）激活。
- 纯函数 `calcDropIndex`（拖拽中心 vs 各标签中点）算插入位，兄弟
  `transform` 让位，被拖项固定宽度跟随；松手只写一次 `centerReorderTabs`
 （store 自带 persist），原地松手零写入；选中态保持不变。
- 内容坐标统一用 `offsetLeft`（不受 transform 影响），要求滚动容器
  `position: relative` 收敛 offsetParent（注释写明勿删）。
- 配套 bug：`:hover` 的名称 mask 在拖拽中继续裁字，而按钮已被隐藏——
  拖拽态必须同步取消 mask（特异度需压过 hover 与触屏常驻两条规则）。
- mouse-only 要在 down 首行显式门控 `pointerType`，否则触屏 capture 成功后
  可激活排序并干扰原生滚动；缺省 `touch-action` 恰好保留触屏横滑查看。
