# 快捷卡片文字省略号点击闪烁修复 — WebView2 Chromium 剪辑特性

## 问题

Tauri（WebView2）模式下，点击引导页的虚线占位框或空白区域时，快捷卡片下方"添加快捷站点"文字在省略号和全文裁剪之间闪烁。浏览器模式（Chrome/Edge）正常。

## 排查过程

1. 尝试多种 CSS 方案均无效：`display: block`、固定 `width`、`contain: paint`、`align-items: stretch`
2. 尝试在 BrowserPanel.tsx 的全局 `click` 处理器中添加 `event.target` 守卫——无效
3. 怀疑是 WebView2 渲染管线差异导致的状态性绘制循环

## 根因

**Chromium 2026 新特性 "Clip text overflow on user interaction"**（[Chromium Feature](https://chromestatus.com/feature/5146265241387008)）：

- 当用户与 `text-overflow: ellipsis` 文字附近交互时，Chromium/WebView2 临时将省略号切换为裁剪（clip），以让用户看到隐藏内容
- 此特性影响**所有**设置了 `text-overflow: ellipsis` 的元素，不限于可编辑控件
- 仅作用于 `text-overflow` 属性，不作用于 `-webkit-line-clamp`

## 修复

| 修改文件 | 变更 |
|---------|------|
| `ShortcutGrid.css` | `.adl-shortcut-card__name` 将 `text-overflow: ellipsis` + `white-space: nowrap` 替换为 `display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden` |
| `ShortcutGrid.tsx` | 占位文本 `<span>` 添加 `title={t.browserAddShortcut}`，保留 hover 全文查看能力 |

`-webkit-line-clamp` 使用**行数裁切**（EllipsisBox 内部机制）生成省略号，代码路径与 `text-overflow` 无关，因此不受 Chromium 剪辑特性影响。

## 经验教训

| 教训 |
|------|
| WebView2 独特行为可能与尚未同步到 Chrome Stable 的新 Chromium 特性有关，排查时需关注 WebView2 与 Chrome 的内核版本差异 |
| `text-overflow: ellipsis` 在 WebView2 中存在"交互即剪辑"的行为，Tauri 双端不一致时应首先怀疑此属性 |
| `-webkit-line-clamp: 1` 是安全的单行省略替代方案，兼容性良好（Chrome/Edge/WebView2 均已支持），且不会被 clip-on-interaction 特性影响 |
| 解决省略号切换后需补充 `title` 属性，保留用户 hover 查看完整文本的能力 |
