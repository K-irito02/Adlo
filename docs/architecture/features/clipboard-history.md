# 剪贴板历史（Clipboard History）

左侧「剪贴板」面板、系统剪贴板捕获与「放大查看」弹窗的实现说明。对应代码：`adlo/crates/clipboard/`、`adlo/crates/server/src/handlers/clipboard.rs`、`frontend/src/app/features/clipboard-history/`。

## 捕获与持久化

- `crates/clipboard/src/monitor.rs` 用 `clipboard-win` 的 `AddClipboardFormatListener` 起后台线程监听；变化时 `read_current` 按 `image > html > rtf > text` 读取，落盘图片/缩略图与 HTML/RTF sidecar，再 `ClipboardStore::insert_or_bump` 入库。
- 连续 3 秒内同 kind 且 content/digest 相同的复制视为重复：覆盖旧行、保留旧 id，并删除旧行引用的文件。
- 监听句柄由 `crates/server/src/engine.rs::spawn_keepalive` 的循环 `park()` 线程持有；`park()` 的虚假唤醒不得释放句柄，否则监听线程会静默退出。
- 数据库为统一 `data.db` 的 `clipboard_items` 实体表；图片等资源在存储根 `clipboard/{images,thumbs,html,rtf}`。

## 保留上限

- `adl_clipboard::MAX_HISTORY_ITEMS = 500`。
- 每次新条目入库后与进程启动时各裁剪一次：按 `created_at` 降序保留最新 500 条，其余条目连同图片/缩略图/HTML/RTF 文件一并删除；裁剪失败只告警，不回滚新条目。
- `GET /clipboard/list` 的 `limit` 上限引用同一常量；前端一次读取 500 条，因此保留的条目都可被看到。

## HTTP / 事件

- `/clipboard/list`、`/clipboard/remove`、`/clipboard/clear`、`/clipboard/write`、`/clipboard/update`，以及 `thumb/:filename`、`image/:filename`、`html/:filename`、`rtf/:filename`、`export?id=…` 静态资源路由。
- 捕获成功后经 `EventBus` 向 `/ws/workspace` 推送 `clipboard-changed`；前端另以 10 秒轮询兜底（页面隐藏时暂停）。

## 面板与查看器

- 顶部标题为「剪贴板」；清空/搜索/筛选三个按钮统一 2px 圆角，悬停/聚焦灰底一致。
- 列表首屏 30 条，每次再展开 30 条；滚动到距底 48px 内自动续页，「加载更多」按钮保留为键盘/无滚动场景入口。
- 「放大查看」弹窗：
  - 文本/富文本可预览（Markdown 渲染 / 沙箱 iframe），编辑与预览互斥。
  - 头部与文本工具行图标按钮使用系统原生 `title`；`aria-label` 保留更具体的读屏名称。
  - 自动换行与预览是持久化偏好，登记键为 `adl:ui.clipboardViewerWrap` / `adl:ui.clipboardViewerPreview`（默认 `true` / `false`）。
  - Markdown 预览复用右侧面板的 `MarkdownPreview`：默认与窄视口（≤760px）的 padding 均与 `regions/rightpanel/markdown-preview.css` 对齐；不换行用 `white-space: nowrap`（不能用 `pre`，否则块间源码换行会放大行距）。
  - 预览/编辑底色由 `.adl-clipboard-viewer__body--active` 铺满整个内容区；Markdown 自身的 `--md-canvas-default` 在弹窗内被清为透明。

## 测试

- Rust：`cargo test -p adl-clipboard --lib`（捕获/去重/裁剪/文件清理）。
- 前端：`frontend/src/app/features/clipboard-history/__tests__/`、`frontend/src/styles/clipboard-viewer-markdown.test.ts`。
