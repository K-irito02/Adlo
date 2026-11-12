# 本地文件在桌面浏览器中按可信文档打开，WebView2 环境参数全应用一致

**Status**: accepted（2026-11-12）

地址栏需要像浏览器一样打开 `file:///`、Windows 盘符与 UNC 本地文件，且本地 HTML 需要读取同目录资源（`fetch`、ES module）。WebView2 对同一个用户数据目录（UDF）只允许一个环境，且环境选项必须逐字一致；因此不能只给子 WebView 加参数。决定：所有 WebView（主窗口、面板、中心、静默、分隔条）共用 `WEBVIEW_ADDITIONAL_ARGS`（wry 默认 `--disable-features=...` + `--allow-file-access-from-files`）；本地页按「可信文档」处理，可渲染扩展白名单内嵌打开；浏览器预览模式只提示桌面端支持。

## Considered Options

- **不给开关，按 Chromium 默认**：本地 HTML 的 `fetch`/模块脚本不可用；`<img>`/`<link>`/`<script src>` 等普通子资源仍可加载。
- **只给子 WebView 加开关**：与主窗口环境选项不一致，同 UDF 创建第二个环境直接 `0x8007139F`（已实测面板空白）。
- **为每个浏览器 WebView 建独立 UDF**：参数可自由不同，但会分裂 cookie/登录态/缓存，并增加多份用户数据磁盘占用；中心/静默已隔离，默认组仍共享。
- **本次采用：全应用同一参数串 + 可渲染扩展白名单**：UDF 一致性成立，本地页获得同目录资源访问能力。

## Consequences

- 新增任何 WebView 必须复用同一常量；改动 wry 版本后需核对默认参数并同步常量。
- `--allow-file-access-from-files` 对所有 WebView 生效，是 UDF 一致性的代价；远端源仍受 Chromium 的 `file://` 同源限制，不能借此读取本地文件，安全边界依赖用户主动输入本地路径。
- 可渲染扩展白名单同时决定「内嵌打开」与「下载抑制豁免」；未列入的扩展仍走下载/外部处理。
- 本地页标题由原生 `DocumentTitleChanged` 与 App 根元数据订阅更新；`browser-page-ready` 对 `file:` 放行以保证揭示时延。
- 领域术语见 [GLOSSARY.md](../../GLOSSARY.md) 的「可渲染本地文件」「智能体站点」。
