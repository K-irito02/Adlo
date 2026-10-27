# 白名单管理下拉（Allowlist Manage Dropdown）

名单类设置项的固定布局：查看管理下拉与添加按钮同行右对齐，条目收进下拉菜单卡片。

## 何时用

名单条目 indefinite（0–N），行内放不下整表时。现覆盖智能体网址白名单与挂起白名单两处。

## 用法

- 容器 `adl-settings-allowlist__actions`（flex 右对齐）；下拉容器 `adl-settings-allowlist__manage`（定宽 200px）。
- 下拉复用 `adl-settings-dropdown__trigger` 视觉；菜单经 portal 挂 body，宽与触发按钮等宽左对齐（仅视口钳制）。
- 条目行 `adl-settings-allowlist__menu-item`：origin 省略 + 右侧移出图标按钮（`adl-icon-btn adl-icon-btn--xs adl-icon-btn--danger-hover`，原生 `title`）。
- 无条目时下拉禁用；条目清零 effect 关菜单（防残留细条）。
- 空态提示放左侧副标题描述下方，用 `adl-settings-allowlist__empty-hint`（DSH 同款蓝），不放 control 列。
- 新增对话框复用 `adl-prompt-modal` 卡片语言；输入框加 `autoComplete="off"`（禁原生历史弹窗）。
- 复用组件：`frontend/src/app/components/settings/AgentAllowlistControl.tsx`（`texts?` 覆盖标题/占位）。

## 反例

- 禁止名单纵向堆在行内（撑高设置页）。
- 禁止菜单与按钮不等宽、移出按钮无红态反馈。
