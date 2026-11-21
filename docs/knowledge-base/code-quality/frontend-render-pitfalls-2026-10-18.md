# 前端渲染陷阱与主题换肤经验（Markdown 预览改造，2026-10-18）

来源：事项 9 悬停换肤「内容区自动下移」根因排查 + 事项 8 变量驱动主题落地 + P4 双轮审查。
适用面广（不限 Markdown 预览）：凡 React 渲染受控 HTML、凡「多套配色切换」、凡需诊断「到底谁改了 DOM」的场景。

## 1. `dangerouslySetInnerHTML` 内联字面量 = 每次渲染都重写 DOM

**症状**：滚动 `.md` 预览后，在主题菜单里来回悬停切换，内容区每次都自动下移一点（实测恒定 +48px，与悬停次数成正比）。最大化窗口才复现，小窗口不复现。

**根因**：

```tsx
// ❌ 每次渲染都是新的包装对象
<div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
```

React 对 `dangerouslySetInnerHTML` 按**包装对象恒等**（`propKey !== lastProp`）判定是否变化——内联对象字面量每次渲染都是新引用，于是**即使 HTML 字符串逐字节相同**，React 仍执行 `domElement.innerHTML = key`（见 `react-dom` 开发版 `updateProperties` → `case "dangerouslySetInnerHTML"`）。整片子树被移除重建 → Chromium 滚动锚定在重建瞬间抖动，表现为滚动位置缓慢爬升。

**修法**：

```tsx
// ✅ 按内容 memo，同内容零 DOM 写入
const innerHtml = useMemo(() => ({ __html: sanitizedHtml }), [sanitizedHtml]);
<div dangerouslySetInnerHTML={innerHtml} />
```

**回归测试断言**（比断言 HTML 文本更有力）：记录 `firstChild` 引用，触发一次仅换肤的重渲染，断言引用**不变**：`expect(el.firstChild).toBe(before)`。已在 `MarkdownPreview` / `XlsxPreview` 落地。

**同类待观察点**：仓库内另有若干 `dangerouslySetInnerHTML={{ __html: iconHtml(...) }}` 写法（Toast / ToastCard / ErrorToast / Icon / FileOpNotice）。它们是**静态小图标 span**（无滚动容器、无频繁重渲染），当前无可观察危害，未改。若将来其中某处进入滚动容器或高频重渲染路径，套用同一 memo 模式。

## 2. 多套配色切主题：换「文件」是错解，换「变量」才是原子同步

- **走过的弯路（三次）**：① 按需 `<link href>` 换文件 → 关键路径有取数 + 解析，切换期间旧表已禁、新表未到 → 闪现旧样式 / 拖慢；② 「预载全部 + 翻 `disabled`」→ 实测 `disabled` 的样式表**不取数**，首次启用才 fetch，等于没预载；③ 构建期 `?inline` + 双 `<style>` 换文本 → 已无网络，但仍是「换整套」思维，且正文/代码两次写入。
- **正解**：**单一样式表 + 变量驱动**，切换只翻容器属性（`data-md-theme`），纯变量重算、同一任务内完成、零取数零 FOUC。这也是 VS Code 内核与同类产品的做法（其 markdown 预览用 `.vscode-light/.vscode-dark` + `var(--vscode-*)`）。
- **配套：官方主题只给了硬编码色**（`github-markdown-css` 6 主题各 189 规则、结构逐字节一致，仅 `color-scheme` 一词之差）。做法是写**生成器**把颜色逐槽参数化为 `--md-*`（`frontend/scripts/generate-md-theme-vars.mjs`），并让生成器**自校验**：
  - pass 1：双边归一到变量形比对（暴露同义不同形的值）；
  - pass 2：值级比对（官方字面量 vs 生成值表，抓手抄错值）；
  - 键存在性前置校验（抓映射表键名打错）；
  - 覆盖选择器发射形态断言（防选择器退化）。
  - 生成产物首行「GENERATED FILE — 请勿手改」，升级上游后重跑脚本；`package.json` 对上游**精确 pin**（`5.9.0`，非 `^`）以免小版本静默漂移。
- **关键坑：高对比覆盖选择器必须是同元素限定**。容器是同一元素双 class（`class="adl-markdown-preview markdown-body"`），写后代组合 `.adl-markdown-preview[data-md-theme=x] .markdown-body h1` **恒不命中**（元素不是自身的祖先），且因当时两族色值巧合相等而**零视觉症状**——只有把选择器写成 `.markdown-body[data-md-theme=x] h1` 才对。审查时「机制失效但当前无可见差异」是最难发现的一类，自校验必须同时校验**发射文本形态**而不只是值。

## 3. 诊断纪律（比结论更重要的三条）

1. **先用埋点把「哪一层坏」钉死，再谈修复**。本例第一轮埋点只记了「DOM 指纹（子节点数 / innerHTML 长度）」并得出「DOM 未变」的**错误中间结论**；第二轮改用 `MutationObserver` 并**按变异类型计数 + 记录详情**（`attributes` / `childList`（含 added/removed 描述）/ `characterData`）后，一次就看清「每次悬停恰 1 次属性变异 + 1 次子节点替换」。诊断探针要**区分类型**，不要只给聚合量。
2. **隔离实验优先于猜**。「同类容器 + 真实样式表、无 React」的最小页里翻转属性不移动滚动 → 干净排除 CSS/布局层，把范围压到 React 侧。比继续读代码快得多。
3. **回执 ≠ 落盘**。本轮出现过编辑工具报告成功、**磁盘上的文件却未被修改**（`starryNight.ts` 的修复连续两次「成功」但 `grep` 仍是旧代码）。教训：关键修复落盘后**必须用 `grep`/读文件在磁盘上断言**；必要时改用脚本直写 + 断言。子代理审查以磁盘为准，恰好抓出了这个假成功。

## 4. 双端 / 构建注意

- `?inline` 把 CSS 作为模块字符串打包，注入 `<style>` 需 CSP 允许 `style-src 'unsafe-inline'`（本项目已允许）。用 `el.textContent = css`（非 `innerHTML`）可避免 `</style>` 破出。打包态 Tauri 会给 `style-src` 追加 nonce/hash（令 `'unsafe-inline'` 失效），因此 `tauri.conf.json` 必须配置 `app.security.dangerousDisableAssetCspModification: ["style-src"]`——漏了只在**安装包**里白屏/无样式，dev 永远正常。
- `img-src` / `media-src` 必须包含 `blob:`：Office 内嵌媒体与运行时 object URL 依赖它；同样只在打包态暴露（dev 的 CSP 不生效）。
- 本地大媒体**不要**用内置浏览器标签承载：子 WebView + `file://` 大视频实测会让宿主窗口失去响应；媒体一律走 `GET /workspace/media` 的 Range 流式端点（任意体积、可拖动进度），内置解不了的编码给「用系统默认程序打开」。
- 系统媒体卡片（事项 17）：Chromium 自己的媒体会话归属 `msedgewebview2.exe`（卡片恒「未知应用」），宿主 AUMID 改不掉；本项目关闭 `MediaSessionService` 并由 Rust 自建 SMTC，浏览器标签页经注入脚本镜像进同一张卡片。
- WASM（starry-night 的 `onig.wasm`）放 `public/vendor/` 随包发布，运行时按 **`import.meta.env.BASE_URL`** 拼 URL 而非相对 `baseURI`（子路径部署下相对路径会 404）；加载失败要有**失败锁存**（否则每次打开都重试取数）+ 纯文本回退（永不白屏）。
- 语言别名：`starry-night` 的 `flagToScope` 不认 `tsx/mts/cts`，需自建别名表；查表要用 `Object.hasOwn` 而非 `in`（`in` 会命中原型链，`constructor`/`__proto__` 这类围栏语言名会让它抛异常 → 把原本的纯文本回退变成渲染期崩溃），并整体包 `try`。
