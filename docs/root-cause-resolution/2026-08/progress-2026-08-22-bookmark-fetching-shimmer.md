# 进度 — 2026-08-22 新建书签"正在获取页面信息..."扫光效果

## [ ] 事项 1：新建书签"正在获取页面信息..."文字加扫光效果
- 状态：进行中
- 根因：CreateTabDialog.tsx 中 `{t.browserFetchingPageMeta}`（第 174 行）为普通内联文字，未应用扫光效果。
- 方案：复用项目已有 `ShimmeringText` 组件（`@/components/shimmering-text`，即图表"加载中"扫光效果），将其颜色变量适配为书签对话框的 `--text-secondary`/`--text-primary`。
- 修复：CreateTabDialog.tsx 中静态文字 `{t.browserFetchingPageMeta}` 替换为 `<ShimmeringText className="[--color:var(--text-secondary)] [--shimmering-color:var(--text-primary)]" text={...} />`，外层 div 移除重复的 color。
- 验证：typecheck ✅，CreateTabDialog.test.tsx 3 项通过 ✅，lint/format ✅。
- 迭代（用户反馈：带宽稍宽、速度稍慢）：给 `ShimmeringText` 新增可选 `staggerSpread`（相位间距缩放，默认 1 向后兼容）；书签用法 `duration 1→0.72`（加快）、`staggerSpread 1.25`（收窄带宽）。typecheck + 测试 ✅。待用户复验。