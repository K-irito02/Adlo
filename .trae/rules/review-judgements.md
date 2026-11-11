---
description: 审查判断项——pre-commit 无法机械拦截、需审查代理逐条核对的跨域禁止项
alwaysApply: false
---

# 审查判断项（Review Judgements）

## 适用范围

`pre-commit` 只能拦机械模式（通配 capability、标识符回潮、调试日志等）；本文件列出**必须由审查代理在 R1/R2 逐条判断**的跨域禁止项。实现代理不需要常驻加载它；审查时按 diff 逐条核对。

## 判断项

1. **WebView 直接触达系统能力**：必须经 Tauri Command；WebView 侧出现文件系统、密钥、原始 SQL 等直接调用即阻断。
2. **低层 crate 依赖高层 crate**：违反分层即阻断。
3. **凭据写入普通配置或日志**：凭据只能经 `crates/credential/` 存储。
4. **跳过红绿测试**：UI/UX 或功能变更后必须有失败用例并转绿；无自动化条件时给一次性复现脚本，不得以「手动看过」替代。
5. **未获批准的全量门禁 / 打包**：`check:full`、`cargo test --workspace`、`cargo tauri build` 需用户批准；日常只跑受影响范围。
6. **单端可用**：功能行为必须在 Tauri 与浏览器模式一致（实现策略可因环境不同）。
7. **被动触发 navigateTab**：WebView URL 变化不得触发 Tauri navigateTab，只能由显式前端操作调用（见 `useBrowserPanelAddressSubmit.ts:submitAddress`、`useBrowserPanelHandlers.ts:handleOpenTabFromTree`）。
8. **UI 文案硬编码**：按钮 / Tooltip / aria-label / 占位符 / 过滤器标签 / 相对时间 / 日期格式 / 面包屑映射等必须使用 i18n key。
9. **语言切换缺 fallback**：依赖 Zustand 易变数据的渲染条件，在切换语言后不得导致标题行或路径栏消失。
10. **常驻错误提示**：错误 / 状态提示必须只在活跃错误状态下可见。
11. **iframe 缺前置检测**：必须 `checkEmbed` HEAD 预检 + 同步 ref 门控 + `attachShadow mode:closed` 的 SafeIframe 沙箱。
12. **z-index 覆盖原生 WebView**：Tauri 下 WebView2 是 OS 级渲染表面；浮动菜单 / 对话框须 `browser_set_bounds` 移出画面（State + MutationObserver 双路），Resize Handle 被覆盖时用「区域逃逸」。
13. **未发布阶段的兼容 / 迁移代码**：禁止数据格式兼容、旧版本迁移分支；确需添加时先与用户确认。
14. **向后兼容重导出**：禁止仅为旧导入路径保留的兼容层。
15. **擅自使用蓝色**：提示 / 警醒 / 填充色一律白 / 灰 / 黑中性色，`--accent` 系仅在用户允许时使用（见 `hint-color-usage.md`）。
16. **并行污染**：两个会话共用同一工作树目录、共享 `CARGO_TARGET_DIR`、或在分支工作树写 `.workbuddy/memory`（见 `parallel-branch-development` 技能）。
17. **面板作用域计数绕过归属谓词**：面板列表 / 计数 / 徽章必须经 `isPanelTab` 或 `panelTabSelectors` 派生；对全量 `browserTabs` / `terminalTabs` 直接取 `.length` 视为可疑（ESLint 已拦裸 `browserTabs.length` / `terminalTabs.length`，例外必须在 stores 层或豁免文件里说明理由）。

## 检查清单

- [ ] diff 中每个新增/修改的能力入口都经过既有边界（Tauri Command / bridge / credential）。
- [ ] 面板作用域的列表与计数使用 `isPanelTab` / `panelTabSelectors`，没有对全量数组取长度。
- [ ] 新增展示文本全部走 i18n；错误提示按活跃状态条件渲染。
- [ ] 功能变更附带红绿测试，且删掉修复后测试会变红。
- [ ] 未执行未经批准的全量门禁或打包命令。
