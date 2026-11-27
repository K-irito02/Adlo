## 范围

- 轮次：R1 / rev4
- Scope：`browser-download-open`
- 文件：`adlo/crates/browser/src/init_script.js`、`adlo/frontend/src/app/App.tsx`、`adlo/frontend/src/app/features/browser/initScriptNavigation.test.ts`、`adlo/frontend/src/app/features/browser/useBrowserUrlChange.ts`
- 审查依据：本轮完整快照；未运行测试套件，未启动服务或浏览器。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

- **rev3 F1：已关闭。** 下载分支注释已限定为“hidden frame 成功挂载时避免内联响应进入当前文档”，并明确说明无容器或挂载失败时助手会回退导航，与 `__adlTriggerNativeDownload` 的两个 `window.location.assign(url)` 分支一致。本轮仅修正注释，没有改动下载行为。

## 新增发现

- 无。本轮未引入新的行为或契约回归。

## 记录不修

- 无。未使用端口，未留下后台进程。

## 结论

- 本轮零问题。
- 需修复项：0。
