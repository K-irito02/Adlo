# 剪贴板放大查看弹窗 37 项重构经验（2026-10-11）

来源：`docs/root-cause-resolution/2026-10/progress-2026-10-10-191437.md`（10 轮）。
只收录可跨任务复用的模式，单点实现细节不收。

## 1. 跨域 `<a download>` 失效 → 原生对话框落盘（双端）

- Chromium 忽略跨源 URL 的 `download` 属性；主窗口 WebView2 未注册 `on_download`，
  退化导航无人接管 → 点击"完全无反应"（不是下载失败，是下载从未发起）。
- 解法：`export` 降级为"取字节来源"，落盘走系统原生「另存为」
 （Tauri `dialog.save_file` invoke / 预览 dev 服务三 OS 对话框 + 写盘）。
- 复用点：任何"把服务端字节存到用户选址"的desktop 功能都走此分工
  （ad-server 只给载荷，壳层拥有目标），不要再试 `<a download>`。

## 2. Tooltip 包裹层才是 grid 子项

- `TooltipSimple` 渲染一层 `.tooltip-trigger` 包裹，`justify-self` 写在内层 button
  上对 grid 无效。居中按钮组用 `1fr auto 1fr` 三列 grid，标题长短不挤偏居中。

## 3. 条件卸载 vs 常驻 hidden（防切换闪）

- 预览面条件挂载会在每次切换时重建：`React.lazy` 首切空白一帧、iframe 每次重载文档，
  再叠加底色瞬切就是"闪跳晃"。
- 解法：浏览/预览面常驻挂载只翻 `hidden`（懒分包与文档加载在打开时后台完成），
  底色加短过渡；`display:block` 类会覆盖 UA 的 `[hidden]`，需一条高特异度兜底规则；
  Tab 焦点陷阱同步排除 `[hidden]`（含祖先 hidden 过滤，否则焦点落进不可见链接）。

## 4. 编辑互斥 + 自动保存 + 代际 guard

- 编辑/预览互斥单选；编辑中进预览先落盘（失败留编辑态）。
- Esc/丢弃与在途保存竞态：已发出的写入无法撤回，用代际计数让在途任务放弃推进基线
  （不覆盖浏览视图、不分叉状态），并以注释写明该取舍；配套回归测试用可控 promise
  复现"落地前 Esc"。

## 5. 四端契约穷尽键 parity 测试

- `http`（`satisfies`）/`mock`（显式类型）编译期锁键集，另加运行时
  `Object.keys().sort()` 相等断言（http↔mock、tauri↔http、preview↔http），
  契约增删只改一端即失败。tauri/preview 系 http spread 继承，只断言键集不重复行为。

## 6. Node 与 Rust 的拒绝语义对齐

- `Buffer.from(x, 'base64')` 从不因非法输入抛错（静默丢弃），而 Rust `STANDARD`
  拒收无 padding/坏字符：校验必须显式做（正则白名单），否则畸形载荷静默落盘。
- 同理：`response.ok` 必须显式校验，否则错误页字节会被存成文件/成为 srcDoc。
