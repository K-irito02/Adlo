# 重命名弹窗交互标准化

## 问题

三个功能面板（文件、变更、浏览器）的重命名弹窗存在两处不一致：

1. **按钮圆角**：取消/确认按钮使用默认圆角（`var(--radius-sm)`），而浏览器快捷方式/端口重命名 dialog 已使用直角按钮（`adl-btn--square`）
2. **缺少关闭按钮**：标题栏右侧缺少 ✕ 关闭按钮，浏览器已有

## 改动

| 文件 | 改动 |
|------|------|
| `components/RenameDialog.tsx` | 取消/确认按钮添加 `adl-btn--square` class；标题栏添加 ✕ 关闭按钮（复用已有 `.adl-prompt-modal__header-close`） |
| `i18n/zh-CN/browser.ts` | `browserRenamePrompt`：`"请输入新目录名称"` → `"重命名"` |
| `i18n/en-US/browser.ts` | `browserRenamePrompt`：`"Please enter a new directory name"` → `"Rename"` |

## 覆盖范围

`RenameDialog` 为共享组件，被以下功能调用：

| 功能 | 调用位置 | 原标题 | 新标题 |
|------|----------|--------|--------|
| 文件 (Files) | `FileNavigatorShell.tsx` | `"重命名"`（默认） | 不变 |
| 变更 (Changes) | `ChangesPanel.tsx` | `"重命名"`（默认） | 不变 |
| 浏览器标签目录 | `browserpanel.tsx` | `"请输入新目录名称"` | `"重命名"` |
| 会话 (Sessions) | `LeftSidebar.tsx` / `SessionList.tsx` | `"重命名会话"` | 不变 |

## 经验教训

1. **共享组件统一维护入口**：`RenameDialog` 被四个功能共用，一处修改覆盖全部。浏览器快捷方式和端口重命名 dialog（`AddShortcutDialog` + `BrowserLandingPage` 内联 dialog）已独立具备直角按钮和 ✕ 关闭按钮，无需额外修改。
2. **i18n 标题不应使用问句/引导句式**：作为弹窗标题，"重命名" 比 "请输入新目录名称" 更简洁清晰，与文件/变更面板的 "重命名" 标题保持一致。
3. **CSS class 复用**：`.adl-btn--square`（`border-radius: 0 !important`）已在 `composer.css` 中存在，直接复用即可，无需新建样式。
4. **现有 CSS 架构支持**：`.adl-prompt-modal__header` 已设 `display: flex; justify-content: space-between`，添加 ✕ 按钮后自动两端对齐，无需额外布局调整。
