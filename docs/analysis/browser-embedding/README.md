# 内置浏览器嵌入调研索引

外部调研（只读，不改源码）。以 Microsoft Learn、WebView2Feedback、各浏览器官方文档为准；访问日期见各文。

| 文档 | 结论要点 |
| --- | --- |
| [webview2-tauri-identity.md](./webview2-tauri-identity.md) | Tauri 2 向每个 WebView 注入 `isTauri`/`__TAURI_INTERNALS__`；`withGlobalTauri` 关不掉；UA 与 Edge 相同；webview 指纹与 IPC 暴露面决定「像不像原生浏览器」。 |
| [webview2-profile-and-events.md](./webview2-profile-and-events.md) | `PreferredColorScheme` 在同一 UDF 内仍是全局（#4920 未修复）；多 profile 只能隔离不能共享登录态；原生事件替代不了 SPA `pushState` 包装。 |
| [antibot-search-risk.md](./antibot-search-risk.md) | Google/Bing 风险控制的可验证机制与诱因；冷 profile、自动化指纹与注入/点击接管会放大验证码概率。 |
| [embedded-browser-patterns.md](./embedded-browser-patterns.md) | 嵌入式浏览器（WebView2/CEF/Electron）在新标签、下载、认证页、profile 上的常见实现取舍。 |

> 决策落地：ADR 0001（UDF 拓扑，2026-11-24 修订为默认共享、可回退隔离）、ADR 0020/0021/0033（站点元数据）。
> 修复经验：`docs/knowledge-base/browser/browser-embedding-hardening-2026-11-24.md`。
