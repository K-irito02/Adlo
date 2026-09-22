# 自定义下拉无限渲染循环：hook 返回新身份 + scrollIntoView 回写（2026-09-23）

> 来源：设置面板 `SettingsSelect`（通用组字体下拉等 7 处消费）。Tauri 实测日志定位，
> 收尾复审确认。关联进度：`docs/root-cause-resolution/2026-09/progress-2026-09-22-211513.md`（事项 15/16）。

## 症状（三位一体，最易误判为三个独立 bug）

1. 自定义滚动条时有时无；2. 拖拽滑块跳动闪烁、释放后位置不动；
3. 滚轮滚动只有晃动感，内容几乎不动。

## 日志实证（`.adl-logs/debug-logs.txt`，界面字体 9 选项）

- `open` 与 `scroll` 以约 5ms 间隔交替刷屏约 500 条，`scrollTop` 被钉死在 75；
- 内容确实溢出（`scrollHeight 305 > clientHeight 230`），控制器 `scrollable:true` 也正确——
  布局与测量都没问题，问题在渲染循环。

## 根因链

`useRevealScrollbar` 每次渲染返回新对象 →
下游 effect 若依赖其整体则每渲染重跑 →
`scrollIntoView` 回写 `scrollTop` →
hook 内 `scroll` 监听 `measure()` → `setState` → 重渲染 → 新对象 → 闭环。

## 修复（三板斧，各对一症状）

1. 下游 effect 禁止依赖 hook 返回的对象本身，只依赖稳定 `ref`（如 `scrollRef`）；
2. `scrollIntoView` 加门控（本例 `keyboardNavRef`：仅键盘导航/打开同步时滚入，鼠标悬停不抢）；
3. 几何定位去重（值不变不 `setState`）+ 菜单内滚动不触发重定位（`menuRef.contains` 豁免）。

## 后续同类坑（本轮亲历）

- **updater 内禁止副作用**：`setActiveIndex((i) => { onHover?.(); return next; })` 在
  StrictMode 下可双调用——闭包值新鲜时直接计算，不走 updater。
- **旗标消费时序**：首开时菜单 DOM 尚未挂载（等定位几何），滚动 effect 空跑会提前消费
  旗标——列表不存在时保留旗标，并把"就绪态"纳入 deps 等下一轮。
- **`{...spread}` 后写同名 prop 获胜**：会静默覆盖 hook 的 `onMouseLeave`（显现状态卡死）——合并调用。
- **`visibility:hidden` 同步脱离 Tab 顺序**（`opacity:0` 不行），需配过渡避免显现生硬。
- **jsdom 无布局**：滑块真实交互自动化覆盖不了，留给真机验证；测试中断言滚动门控时
  `scrollIntoView` 挂载要按"有则恢复、无则删除"处理。
