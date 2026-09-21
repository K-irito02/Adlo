# 终端复合按钮悬停菜单：卸载不触发 mouseleave 与去抖写污染水合读数

> 2026-09-13 · 终端 Shell 选择器悬停开门 + 三区 2s 自动关闭 + 绑定持久化。两条可复用教训。

## 教训 1：子菜单卸载不触发 mouseleave，悬停位必须显式清理

子卡片 DOM 卸载（选择工作区后 `setActiveSubMenuId(null)`）不会触发 `onMouseLeave`，
`hoverZonesRef.sub` 永久残留 `true` → 超时关闭回调每次采样都跳过 → 主菜单**永久不再自动关闭**。

修复（两处，缺一不可）：

1. 选择回调内显式清位：`hoverZonesRef.current.sub = false`（菜单保持打开时只有这里能清）；
2. `!menuOpen` effect 清零全区悬停位并取消全部悬置计时（治愈选择即关 / 外部点击关后的残留位与悬置空计时）。

原则：**任何用"悬停位"做关闭判决的系统，都要在"关闭动作"处同步清位**，不能只依赖 mouseleave（卸载、编程式关闭都不触发它）。

## 教训 2：去抖写会污染水合测试的读数，测试先放干再播种

`makePersistedWriter` 的 50ms 去抖 flush 由早先测试遗留，在水合测试播种后、读取前落盘，
把种子值覆盖（如 `ws-9` 覆盖 `ws-7`），表现为间歇失败（约 2/5 概率）——这正是生产侧
F9 水合竞态（延迟水合覆盖用户先行操作）在测试中的镜像。

修复：水合测试组 `beforeAll` 先真时钟 sleep 150ms 放干遗留 flush，再 `clear → 播种 →
fake 计时 → 动态 import（resetModules 隔离 _defaultsHydrated 单例）→ 推进 → 断言`。
5 连跑 38/38 稳定。

原则：涉及"延迟写 + 延迟读"的单测，播种前必须先排空共享调度器的悬置写入；
模块级单例守卫（`_defaultsHydrated`）的测试必须 `vi.resetModules()` + 动态 import 隔离。
