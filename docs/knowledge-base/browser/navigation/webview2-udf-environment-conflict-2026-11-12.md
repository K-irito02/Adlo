# WebView2 同一 UDF 的环境参数必须逐字一致（0x8007139F）

- 日期：2026-11-12
- 范围：Tauri 桌面内置浏览器（child WebView2）
- 关联：`adlo/src-tauri/src/commands/browser_webview_setup.rs`、`adlo/src-tauri/tauri.conf.json`、`adlo/crates/browser/src/browser_navigation.rs`

## 现象

- 给面板子 WebView 单独加 `--allow-file-access-from-files` 后，右侧浏览器标签一直空白。
- Rust 日志：`failed to create webview: WebView2 error: WindowsError(HRESULT(0x8007139F), "组或资源的状态不是执行请求操作的正确状态。")`。
- 移除该参数后，面板恢复；但主窗口与子 WebView 的环境参数仍可能不一致。

## 根因

WebView2 对**同一个用户数据目录（UDF）**只允许一个环境，且 `CreateCoreWebView2EnvironmentWithOptions` 的选项必须一致。wry 在每次创建 WebView 时都会新建环境（除非显式传入 `environment`），并把 `additional_browser_args` **逐字**写入环境选项：

- 主窗口（`tauri.conf.json`）未传参数 → wry 使用默认 `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`；
- 面板子 WebView 传了 `--allow-file-access-from-files` → 选项字符串不同；
- 同一默认 UDF 上第二次创建环境 → `0x8007139F`。

## 修复

1. 定义共享常量 `WEBVIEW_ADDITIONAL_ARGS`，内容 = wry 默认 `--disable-features=...` + 需要的开关（本项目为 `--allow-file-access-from-files`）。
2. 主窗口 `app.windows[0].additionalBrowserArgs` 与所有子 WebView（面板/中心/静默/分隔条）使用**同一字符串**。
3. 加单测断言 `tauri.conf.json` 与常量逐字相同（`main_window_shares_webview_additional_args`）。

## 防复发

- 新增任何 WebView（包括分隔条等非浏览器 WebView）时，必须复用同一常量；否则同一 UDF 的环境会再次冲突。
- 改 wry 版本后检查其默认参数是否变化：常量需同步包含新的默认项，否则主窗口会丢掉 wry 的默认抑制项（当前 wry 0.55 默认是 `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`）。
- 不要给单个子 WebView 加 per-WebView `additional_browser_args`，除非同时改主窗口与所有同 UDF 的 WebView。
