# 快捷键与下载迁移复审经验 — 2026-09-25

> 本轮 closing review（4 Agent）与 storage SDD fix wave 中沉淀的可复用教训。

## 1. 正则 lookbehind 是解析期风险，不是运行时分支

`/(?<!mo)cmd/` 这类写法在不支持的引擎（Safari < 16.4）里整个模块加载即
`SyntaxError`，无关代码走不走得到。凡工具函数可能进浏览器模式，一律用
顺序替换/占位符写法，并加一条别名单测（`cmd+n`、`command+n`）。

## 2. contenteditable 拦不住 tagName 检查

面板级快捷键的"可编辑目标"守卫若只看 `INPUT|TEXTAREA|SELECT`，CodeMirror 6
（div + contenteditable）会漏网，`preventDefault` 直接吞掉编辑器按键。
守卫必须用 `closest('input, textarea, select, [contenteditable="true"], .cm-editor')`，
并配"从 contenteditable 子节点 dispatch"的单测——本次 H-1 就是这么被抓住的。

## 3. fail-open 聚合里"未知"与"默认形"必须区分

store 初值恰为默认形（如 `{ default_path: '', auto_migrate: false }`）时，
"未加载"与"默认"无法区分 → 需要显式的 loaded 标记（如 `downloadSettingsLoaded`），
否则按钮在数据未知时被误禁用。树 stats 同理（null → false，不能回退到默认值再判定）。

## 4. Rust 测试想进 temp，先解决保护表问题

Windows 上 `temp_dir()` 位于 AppData 深保护树内，迁移类测试直接搬过去会被
自身的保护逻辑干扰。用 `thread_local!` 测试覆盖表（仅 `#[cfg(test)]`）置空，
保护单测从不设置覆盖、读真实表——并行互不影响。不要为此改生产签名。

## 5. 显示串进查询可以，但单测必须把平台定死

`formatKeybind` 输出含平台字形（Win `Ctrl+N`、Mac `⌘N` 无加号）。若查询存的是
显示串（如搜索框捕获提交），同平台三路匹配成立，但单测在 Mac 跑即挂。
凡断言显示文本的用例，一律在文件头 `Object.defineProperty(navigator, 'platform', …)`
定死平台（本轮 `titleBarMenus.test` / `KeybindSettings.test` 均已如此）。
