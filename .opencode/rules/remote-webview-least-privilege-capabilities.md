---
description: 远端网页 WebView 单独 capability（仅 core:default）+ main 窗口分级白名单 + digital-life.toml 逐条枚举命令
globs: adlo/src-tauri/capabilities/**,adlo/src-tauri/permissions/**,adlo/crates/browser/**,adlo/src-tauri/src/**
alwaysApply: false
---

# 远端 WebView 最小权限 capabilities 分级

## 规则描述

Tauri 2.x 的权限被拆分为**按窗口/WebView 生效的 capabilities** + **逐条枚举的 permission 白名单**：

| 对象 | 文件 | 权限 |
|------|------|------|
| main 窗口（本应用 UI） | `capabilities/default.json` | 仅 `windows: ["main"]`；显式列出 `core:window:allow-*`、`dialog:default`、`shell:default`、`digital-life-commands` |
| 远端网页 WebView | `capabilities/browser-remote.json` | 仅 `webviews: ["adl-browser-view-*"]` + `remote.urls: https://*`；权限只有 `core:default`，**没有任何业务命令** |
| 业务命令集合 | `permissions/digital-life.toml` | ~80 个命令逐条 `commands.allow`，零通配符；pre-commit 强制禁止 capability 通配 |

远端内容（用户浏览的任意 https 站点）运行在 OS 级渲染面中，绝不能继承 main 窗口的 IPC 能力。capability 的匹配面与 Rust 里 `webview_label()` 生成的 `adl-browser-view-{tab_id}` 标签严格对应：**label 前缀改动 → `main.rs` 的 `strip_prefix("adl-browser-view-")` 和 `browser-remote.json` 的 `webviews` 通配必须同步**。

## 正确示例

```jsonc
// capabilities/browser-remote.json —— 远端内容的全部世界
{
  "identifier": "browser-remote",
  "webviews": ["adl-browser-view-*"],
  "remote": { "urls": ["https://*"] },
  "permissions": ["core:default"]      // 不多一个业务命令
}
```

```toml
# permissions/digital-life.toml —— 业务命令逐条放行
[[permission]]
identifier = "digital-life-commands"
commands.allow = ["app_get_info", "browser_navigate_tab", …]
```

## 错误示例

```jsonc
// ❌ 给远端 WebView 复用 default capability（或加 * 通配）——
// 任意网页拿到 app_save_file / browser_* / storage_* 全部 IPC
{ "webviews": ["adl-browser-view-*"], "permissions": ["core:default", "digital-life-commands"] }
```

```toml
# ❌ commands.allow = ["*"] 或把 default.json 的权限集合复制到 remote capability
```

## 适用场景

- 新增一个可加载远端内容的 WebView/iframe 宿主：先复制 `browser-remote.json` 模式，只给 `core:default`，再按需单独加 permission；
- 新增 Tauri 命令：同步登记到 `permissions/digital-life.toml` 的 `commands.allow`（漏登记 = 命令对 main 窗口也不可用，功能直接死）；
- 修改 webview label 格式时：连带检查 `capabilities/browser-remote.json` 的通配、`main.rs` 的 `strip_prefix` 两处——三者是同一个契约；
- 安全审计时先读这两个 capability 文件，即可判断远端内容/本地 UI 各自能触达什么。

## 相关文件

- `adlo/src-tauri/capabilities/browser-remote.json`（远端 WebView 最小权限）
- `adlo/src-tauri/capabilities/default.json`（main 窗口白名单）
- `adlo/src-tauri/permissions/digital-life.toml`（业务命令逐条枚举）
- `adlo/crates/browser/src/browser_webview.rs`（`webview_label()` 标签生成）
