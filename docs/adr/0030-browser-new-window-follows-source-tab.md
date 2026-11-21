# 页面内新窗口请求跟随发起标签的宿主落地

**Status**: accepted（2026-11-22）

浏览器页面通过 `target=_blank` 或 `window.open` 发起的[新窗口请求](../../GLOSSARY.md#浏览器)由宿主转成新的浏览器标签。旧实现的事件只携带 URL，前端唯一的订阅点固定在右侧面板开标签，导致中心页面里的 B 站站内搜索等操作把新标签开到面板，空间连续性断裂。决定：

1. **事件携带[发起标签](../../GLOSSARY.md#浏览器) id**：注入脚本的 postMessage 路径与 Tauri `on_new_window` 路径都必须带 `tabId`，缺来源的请求按面板兜底。
2. **按发起标签所在宿主落地**：中心标签发起 → 中心新标签；面板标签发起 → 面板新标签。前端由单一 store action `browserOpenNewWindowTab` 统一路由，App 只保留一处全局订阅，面板不再单独订阅。
3. **fresh 标记跨宿主共享**：本会话新建标签的 fresh 标记放在 store，由 WebView 生命周期消费；否则中心侧的下载型新标签会被当成重启水合标签而跳过 WebView 创建。

## Considered Options

- **始终开在右侧面板**（旧行为）：实现最简单，但中心页面操作跳到面板，用户需要跨区域寻找新标签。
- **始终开在中心**：对面板页面是反向的同种断裂；面板的紧凑浏览场景会被中心抢占。
- **前端按当前焦点/可见浮层推断宿主**：浮层、跨宿主同时挂载与键盘操作下不可靠，且会随 UI 结构调整失效。
- **按发起标签的 location 路由**（选定）：与 Chrome/Edge「新标签留在同一窗口」的空间语义一致，且来源在事件产生点最准确。

## Consequences

- `browser-open-new-tab` 的载荷从 `{url}` 变为 `{tabId,url}`，属于跨 Rust/前端契约；新增事件来源必须带发起标签。
- 下载链接的新窗口也跟随宿主落地；新标签承载触发 `DownloadStarting` 的 WebView，当前不自动关闭。
- 中心与面板共享同一份 fresh 标记与路由 action；新增宿主时只需扩展 `resolveNewWindowTabHost`。

相关术语：[发起标签](../../GLOSSARY.md#浏览器)、[新窗口请求](../../GLOSSARY.md#浏览器)、[中心](../../GLOSSARY.md#区域与标签)、[面板](../../GLOSSARY.md#区域与标签)。
