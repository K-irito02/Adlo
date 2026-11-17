# 内部拖拽使用 Pointer Events，保留 Tauri 原生文件拖入

**Status**: accepted（2026-11-17）

书签目录与已打开标签页的内部拖拽需要与 Tauri 的**原生文件/文件夹拖入**共存。Windows 上 Tauri 2 默认 `dragDropEnabled: true` 会拦截 WebView 的 HTML5 `dragstart/dragover/drop`，两者互斥。决定：**保留 `dragDropEnabled`，内部拖拽改用 Pointer Events**（4px 阈值 + `elementFromPoint` 命中 + 自定义抬起副本与 portal 投放指示）；HTML5 DnD 只保留给浏览器着陆页的快捷站点等非 Tauri 拖拽场景。

## Considered Options

- **关闭 `dragDropEnabled`，内部拖拽用 HTML5 DnD**：实现最简单，但会失去“把文件/文件夹拖入应用打开工作区”的原生能力。
- **按宿主/平台条件切换两种机制**：浏览器模式与桌面模式行为分叉，双端一致性和测试成本更高，且拖拽反馈无法复用。
- **本次采用：Pointer Events + 保留原生拖入**：内部拖拽完全由前端控制，原生文件拖入继续走 Tauri 通道。

## Consequences

- 内部拖拽不再触发 `dragstart/drop`；测试必须提供 `PointerEvent` polyfill（jsdom 26 默认缺失）。
- 拖拽结束后需要在 document 捕获层抑制一次 click，避免松手顺带触发下层按钮。
- 抬起副本与投放指示使用 fixed 元素；面板内容容器的 `transform` 会成为 fixed 包含块，因此 overlay 必须 portal 到 `document.body`。
- 相关术语见 [GLOSSARY.md](../../GLOSSARY.md) 的「抬起副本」「落点」「投放指示」「插入线」「禁止态」。
