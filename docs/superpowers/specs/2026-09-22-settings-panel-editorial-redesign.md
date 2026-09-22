# 设置面板 Editorial 重设计（Premium Utilitarian Minimalism）

- 日期：2026-09-22
- 范围：右侧面板 → 设置面板（面板壳层顶栏 + 左导航 + 6 设置组主内容区）
- 方法：brainstorming（bounded 分类）→ 红绿测试 → 3 轮代码审查收尾

## 用户决策

| 问题 | 选项 | 决策 |
|------|------|------|
| 改动深度 | A 仅样式 / B 结构+样式 | **B**（结构+样式全改，可不沿用现有设计） |
| 作用范围 | A 仅主内容区 / B 主内容区+面板壳层 | **B**（含壳层） |
| 协议落地 | A 仅借鉴 / B 尽量贴协议原文 | **B**（卡片化区块、serif 组标题、行 stagger 淡入） |

## 硬约束

1. 亮/暗主题都成立；颜色只走 `var(--…)` token，不写死十六进制。
2. `--font-serif` 仅设置面板作用域引入，不改全局 `--font-sans`。
3. 不改设置逻辑 / IPC / store；纯结构 + 样式重构。
4. 不加滚动监听 / 真实图片；入场动画只用 `transform` / `opacity`。
5. 全部 UI 文案走 i18n（项目铁律）；bento 网格不硬塞行内表单。

## 设计词汇（实现契约）

- 卡片：`.adl-settings-card`（1px hairline + `--radius-lg` + `--space-6/7` padding）。
- 标题：共享工具类 `.adl-settings-title--serif`（family/tracking/leading only，字号各 block 自定）；禁止跨 block 复用 BEM modifier。
- 状态：`.adl-settings-status--{success,info,warning,danger}`（pastel token，亮暗各一套）；注意 `<small>` 在 `__label` 内需 `(0,2,0)` 复合选择器复写（教训：`(0,1,1)` 的 label 规则会吃掉 display/color/line-height）。
- 入场：stagger 阶梯 0–400ms（步长 80ms）+ `nth-child(n+7)` 封顶 480ms；workspace bento 网格卡走独立短阶梯（80/160/240/320ms）。
- 搜索高亮：info pastel（warning 语义留给真正的警告）。
- Serif 栈：系统字体（Georgia / Times New Roman），不打包 webfont，保证跨机器确定性。

## 文件清单

- `frontend/src/styles/components/settings.css`（全量重写）、`regions/dsh.css`（设置段）、`tokens.css`（`--font-serif` / `--ease-editorial` / `--duration-editorial`）、`themes.css`（pastel 亮暗）。
- 结构：`SettingsPanel/Header/Controls/KeybindSettings`、`WorkspaceSettings`、`StorageSettings`（+`StorageCategoryRow` / `BrowserDownloadPathSection` 内联迁移）、`BrowserPerformance/DownloadSettings`、`DshSettings`。
- 测试：7 个设置测试文件（48 用例），新增 `WorkspaceSettings` / `BrowserSettings` / `DshSettings` 测试。

## 验收

- 全量前端 2596 用例通过；`eslint` / `tsc --noEmit` / `prettier` 全绿。
- 收尾 3 轮审查：18 → 7 → 0 actionable（报告 `.review-diffs/`，清理时删除；过程见 `docs/closing-workflow/2026-09/`）。
- 接受项：N4 卡片分组（有意设计）、R1 stagger 矩阵（新增设置根时再收敛为 `--card-index` 方案）。
