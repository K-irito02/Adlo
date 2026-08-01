# Root Cause Resolution — 根因排查进度记录

本目录归档通过 `root-cause-resolution` 技能执行的系统化调试过程的进度与中间产物。

## 目录

- [progress-2026-07-20-160900.md](./progress-2026-07-20-160900.md)
- [progress-2026-07-21-123000.md](./progress-2026-07-21-123000.md)
- [progress-2026-07-21-143000.md](./progress-2026-07-21-143000.md)
- [progress-2026-07-21-163000.md](./progress-2026-07-21-163000.md)
- [progress-2026-07-21-225000.md](./progress-2026-07-21-225000.md)
- [progress-2026-07-21-225905.md](./progress-2026-07-21-225905.md)
- [progress-2026-07-24-101500.md](./progress-2026-07-24-101500.md)
- [progress-2026-07-25-180116.md](./progress-2026-07-25-180116.md)
- [progress-2026-07-25-180456.md](./progress-2026-07-25-180456.md)
- [progress-2026-07-25-182000.md](./progress-2026-07-25-182000.md)
- [progress-2026-07-25-212340.md](./progress-2026-07-25-212340.md) — 日历热力图 5 项 Bug 修复（时区/透明填充/Y轴/Tooltip/滚动条振荡）
- [progress-2026-07-28-003300.md](./progress-2026-07-28-003300.md) — 分支图谱全量修复：无限渲染循环/列对齐/调试日志/头像/Tooltip卡片样式/每commit行内标签/泳道标签行补充标签/refsLabels独立过滤/Rust branch优先级/Tooltip完整分支信息/泳道节点颜色同步/共存逻辑/i18n等（115/115测试通过，Phase 4收尾完成）
- [progress-2026-07-29-104840.md](./progress-2026-07-29-104840.md) — 标签行间距/ref标签独立拖拽/泳道节点悬停放大/死代码清理 + 预存问题修复（过时注释/i18n键/调试日志/CSS死类）
- [progress-2026-07-30-000000.md](./progress-2026-07-30-000000.md) — BranchGraph 标签拖拽全量性能优化（TCopyContext/拖拽重写/悬停分离/useDeferredValue/类型迁移）
- [progress-2026-07-30-064500.md](./progress-2026-07-30-064500.md) — 分支图谱头像显示问题修复：行hover节点放大/像素头像兜底/Tooltip延迟/两级缓存/SWR延迟revoke/闪烁修复（Phase 4收尾完成，862/862测试通过）
- [progress-2026-07-30-204202.md](./progress-2026-07-30-204202.md) — Git可视化图表空白状态文本清理（分支图谱/文件旭日图）+ TagRow层叠上下文修复（isolation: isolate）+ 死代码清理（孤儿i18n键gitVisNoData/test mock）
- [progress-2026-07-31-223901.md](./progress-2026-07-31-223901.md) — 代码行演变图表按钮改进（去描边/短文本/横向布局/hover增强）, 主题切换按钮背景色与文字色闪烁修复（移除 background-color/color 过渡，仅保留 opacity 过渡）
- [progress-2026-08-01-133130.md](./progress-2026-08-01-133130.md) — Git可视化图表 3 项修复（CommitTimeline 双 y 轴标签重叠/tooltip 粒度化/x 轴跨年标签重叠）+ Phase 4 子代理复验收尾（统一 domainExtensionInSteps 守卫、dateLabelFormatterFor 共享化、死代码清理，912/912 测试通过）
- [progress-2026-08-01-190219.md](./progress-2026-08-01-190219.md) — Git可视化代码行演变/提交时间线 修复：y-domain tween 关闭（线条异常巨大 + 悬停渲染循环）、确认按钮卡加载、refreshChart latest-wins 竞态、useAnimatedSeriesPath ref 化、接通加载状态（骨架屏 + 400ms 揭示）、缩略条 xDomain 扩展 + selectionEnd 默认选区自动覆盖真实数据末日 + 主图 x-domain 收敛（天粒度自动显示最新日期 8/1，周粒度仍停最后周一 7/27 无空白，消除 x 轴投影尾重叠）、periodEndInclusive 保证最后不完整周数据不丢、**时区统一为 UTC 修复最后数据点被 domain 过滤（8/1/7/27 丢失 + 空 7/25/7/30 投影刻度）**、主图 xDomainSlotCount 改用自身数据行数。Phase 4 收尾：移除临时验证日志、periodEndInclusive 周粒度改为"所在周周日"、filter 提取 periodEndMs 常量、移除 ChartBrushLayout 死输出 xDomainSlotCount。closing-workflow 收尾审查修复：refreshWorkspace 竞态守卫、seq workspace 隔离、失败 rethrow + Promise 消费、useAnimatedSeriesPath onUpdate live-ref、preview 服务对齐 Rust（升序/月 key/day 语义/消息 | 保留）、latest-wins 测试补齐（936/936 测试通过）。**渲染循环（Maximum update depth exceeded）标注待解决**，保留 4 个 [loop] 探测器供后续排查。附带修复浏览器 preview 数据形状、activeWorkspaceTab 自动选中、月粒度日期格式。
