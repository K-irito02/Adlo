# Markdown 预览正文链接路由经验（2026-10-18）

文件/变更面板 Markdown 预览正文三类链接（章节锚点 / 文件索引 / 网址）的点击路由沉淀。

## 根因与修复对照

| 现象 | 根因 | 修复 |
|------|------|------|
| 中文锚点点击无反应 | markdown-it 把非 ASCII 锚点 percent-encode，标题 id 是原始 Unicode slug，比对永不命中 | 比对前 `decodeURIComponent`（失败回退原文）；回退匹配改双边 `slugify` |
| `file.md#sec` 打不开 | fragment 被当成文件名一部分参与解析 | 解析前同时剥 `#fragment` 与 `?query` |
| 跨工作区预览打开错文件 | 打开链只认 `currentWorkspace`，不认文件所属工作区 | `resolveLinkWorkspace(workspaceId?)` 归属优先；历史条目改为 `{path, workspaceId}` |
| 目录链接报读文件错 | 目录形路径走读文件链 | 尾部分隔符判定 + 文件树定位展开（`revealInFileTree` + 滚动跟随瞬态通道），不读文件 |
| 裸写 `AGENTS.md` 变成可点击网址 | `linkify:true` 的 fuzzy 匹配把裸域名当网址（`md` 是合法顶级域） | `md.linkify.set({ fuzzyLink: false })`（文档侧同时把裸写改为代码 span） |
| `[doc](file:///…)` 不可点击 | 双层过滤：markdown-it 默认 `validateLink` 拦截 `file:` **且** DOMPurify 默认 `ALLOWED_URI_REGEXP` 剥掉 `file:` | 两层同时放行 `file:`（`validateLink` 覆写 + sanitize 选项）；点击仍走 `preventDefault` + 内部路由，安全 |

## 落点统一

网址与文件链接都走「打开方式」设置（`openUrlByMethod`/`openFileByMethod`），与智能体站点拦截链接同链路；外部兜底只传良构 `file://` URL，不传裸 Windows 路径。

## 滚动跟随

文件树定位后滚动由文件导航器消费瞬态 `fileTreeRevealRequest {workspaceId, path, nonce}`（不落盘）；成功与耗尽（30 帧）都消费，避免 remount 重放。

## 相关文件

- `frontend/src/app/features/preview/openByMethod.ts` — 解析与打开统一入口
- `frontend/src/app/features/preview/MarkdownPreview.tsx`、`markdownPreviewUtils.ts` — 点击委托与渲染
- `frontend/src/app/regions/right-panel/hooks/useFileHistory.ts`、`useFileTreeRevealOnRequest.ts` — 历史归属与滚动
