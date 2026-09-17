# 左栏系统监控优化与滚动持久化经验（2026-09-17）

> 来源：左侧边栏系统监控 11 项优化 + 持久化（root-cause 进度 `docs/root-cause-resolution/2026-09/progress-2026-09-17-120000.md`，收尾 `docs/closing-workflow/2026-09/progress-2026-09-17-102343.md`）。

## 滚动恢复（`usePersistedScrollTop`）

1. **条件渲染容器 + mount 期 effect 挂监听 = 监听永不挂上**：容器在 loading/空态后才出现，父 mount 时 `ref.current` 为 null，effect 直接 return 且依赖永不变 → scrollTop 从未被保存。解法：回调 ref，在节点到达/离开时挂载/卸载监听 + 试恢复/落盘。
2. **forwardRef 组件 effect 转发 ref 必须补 cleanup 回传 `null`**，否则回调 ref 的 detach 分支断裂（监听泄漏、落盘缺口）。本轮给 `CustomScrollArea` 补了 3 行通用修复（仅传 ref 的新 hook 受影响，既有调用方零影响）。
3. **落盘必须 pending 门控**：无滚动、无 pending 的卸载不得写入，否则短内容卸载以 0 覆盖已存值。
4. **程序化抑制标记只置位、不清零**：no-op 恢复（值未变）不得洗掉待消费的抑制，否则连续 `tryRestore` 后程序化事件被误判为手动，导致提前 disarm + 钳制值覆盖。
5. **去抖回调读实时节点**（`nodeRef.current`），不捕获事件时刻的旧节点。
6. **恢复触发用稳定信号**：快照对象每秒新 identity，直接依赖会导致 effect 每秒空跑，改用布尔跳变 + 条目数。

## CSS 与交互

7. **flex 行中 `margin-left: auto` 会吞掉 `flex: 1` 的自由空间**（bar 塌缩）：只在"进度条隐藏态"的容器查询内对数值使用。
8. **窄态隐藏进度条用 `@container` 而非 viewport 媒体查询**：容器是侧栏宽度，与视口无关；`container-type: inline-size` 只约束内联轴。
9. **`table-layout: fixed` 下操作列内容盒 = 列宽 − 两侧 padding**：20px 按钮配 22px 列时须把单元格横向 padding 收至 1px，否则 `overflow: hidden` 裁剪按钮。
10. **opacity 隐藏的按钮仍在 Tab 序列**：刻意保留（键盘可达优先于 Tab 噪音），配合 `focus-within` 高亮；触屏（`hover: none`）则常显。

## 流程教训

11. **HMR 中期模块热更会产生一次性 Hooks 顺序报错**：编辑中 vite 热更新了新旧 hook 顺序不同的模块，ErrorBoundary 自愈；判定以静态代码 + `eslint react-hooks` + 测试为准，不为瞬时日志修代码。
12. **测试文件遵守 `__tests__/` 就近规则**（`.agents/rules/frontend-test-tests-co-location.md`）：既有平铺在源码旁的旧测试属历史遗留，新文件必须进 `__tests__/`。
13. **i18n 文件编辑后必读文件复核**：本轮一次清理误删了仍在用的 `sysNetwork`（与目标 key 相邻），grep + tsc 双重核实才兜住。
