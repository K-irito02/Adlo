## 范围

- 仅审查 `adlo/frontend/src/app/components/settings/SettingsPanel.test.tsx` 的 rev1 未提交改动（快照 `adlo_frontend_src_app_components_settings_SettingsPanel.test.tsx-rev1.diff`）。
- 只读上下文：`ResetAllDialog.tsx`、`ResetAllDialog.test.tsx`、`SettingsPanel.tsx`、测试配置与相关测试规约；未修改源码或配置。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

- 无上一轮 R1 finding。本轮指定事项「标题出现早于 `ResetAllDialog` passive effect 安装导致 Escape 偶发不关闭」：**已关闭（代码级同步成立）**。
- `SettingsPanel.test.tsx:406-409` 在发送 Escape 前等待 `document.activeElement` 进入 `role=dialog`。`ResetAllDialog.tsx:77-93` 的 Escape listener effect 先于 `ResetAllDialog.tsx:130-139` 的焦点 effect 声明；同一提交的 passive effects 按顺序执行，因此焦点进入对话框可作为 listener 已安装的可观察同步点。
- 删除性推演：删掉焦点 effect，新增 `waitFor` 会超时；删掉 Escape listener effect，焦点等待仍会通过，但 `SettingsPanel.test.tsx:410-412` 的 Escape 关闭断言会变红；删掉本次新增的等待则恢复原有「标题已出现但 listener 尚未安装」窗口，进度记录中已有同用例全量高负载失败证据。
- 等待未引入错误焦点对象或明显超时回归：`document.activeElement` 为 `Element | null`，`Node.contains(Node | null)` 可直接接受；首次检查时对话框已由标题查询确认存在，后续仅等待焦点条件。默认 `waitFor` 超时未改动，生产焦点 effect 会在 listener effect 之后同批执行。
- 测试标题「对话框按 Escape 与点 overlay 关闭且不执行」与断言一致：`SettingsPanel.test.tsx:410-412` 覆盖 Escape 关闭且不执行，`:414-418` 覆盖 overlay 关闭且不执行；新增焦点等待没有扩大或偏离标题承诺。
- 定向实跑：在 `E:\AI-DIGITAL-LIFE\SourceWorkspace\adlo` 执行 `pnpm --dir frontend run test:one -- src/app/components/settings/SettingsPanel.test.tsx`，结果为 **1 file passed / 83 tests passed**，退出码 0。按约束未跑全量套件，故不把单文件结果表述为全量负载稳定性已实测；最终门禁由主代理执行。

## 新增发现

无。

## 结论

- 需修复项：0
- critical/high/medium/low：各 0。
- 本轮改动正确关闭了指定竞态，未发现等待超时、错误焦点对象或测试标题/断言不一致的回归。
- 未启动 dev server、浏览器或 headless 进程，无使用端口。
