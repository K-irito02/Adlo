# 设置 ·「关于」组设计（Colophon）

- 日期：2026-11-05
- 状态：已实现
- 决策来源：用户在 4 个 HTML 原型变体中选定 **A · Colophon 居中**（对齐 OpenCode 的关于页气质）。
  原型文件为一次性产物，按技能要求已删除，不入库。

## 1. 目标与边界

「关于」回答的是**这个应用自己是什么**，不是「用户机器上装了什么」。

| 展示 | 不展示 |
|------|--------|
| 应用名、版本、一句定位 | Node.js / Git / Bash / DSH / OpenCode CLI 的版本（属「环境」组，随用户安装时机变化） |
| 应用运行时（Tauri / 渲染引擎 / OS / 架构） | 构建 commit / 构建时间（仅进诊断单，见 §5） |
| 网站 / 仓库 / 问题反馈 | 「检查更新」（当前无更新通道，不做假按钮） |
| 许可（MIT 全文，独立弹窗） | 商标声明（未注册，不写 `®`） |
| 致谢（字体 / 素材 / 图表 / 编辑器 / 框架 / 外部工具，独立弹窗） | 与致谢无关的「灵感名单」分组 |
| 第三方声明（随包素材与移植代码，独立弹窗） | 全量依赖许可（发布前生成后并入，见 §6） |
| 打开日志目录（有效日志目录） | 数据目录、占用等（属「存储」组） |

文案事实纪律：未知值显示「未知」，不回退成猜测值；不写无法核验的宣称。

## 2. 布局（Colophon 居中）

```
[图标]  Adlo · 安洛
        版本 0.1.0
        桌面应用宿主。
        基于 MIT 许可证发布。
        ───
        网站 / GitHub 仓库 / 问题反馈
        ───
        许可   致谢   第三方声明
        运行时 · 引擎 · 系统
        打开日志目录
        © 2026 K-irito02
```

- 单列居中，层级靠字号/字距/留白，不使用 accent 色。
- 内容宽 280px 上限，右面板 320px 起仍成立。
- 组件：`app/features/about/AboutSettings.tsx`；样式：`styles/regions/about-settings.css`。
- 图标：`public/adlo-icon.png` 是 `src-tauri/icons/128x128.png` 的副本（Vite 不能直接引用 `src-tauri`），
  同时用于关于页、开屏与窗口图标；更换应用图标时两处同时替换（发布清单含该项复核）。
- 组位置：设置导航最后一项（环境之后）；不参与「恢复全部默认」，不进设置搜索索引。

## 3. 数据来源

| 字段 | 来源 | 备注 |
|------|------|------|
| 应用名 / 版本 | `appInfo.appName` / `appInfo.version` | Rust `CARGO_PKG_VERSION`（0.1.0） |
| Tauri 版本 | `appInfo.runtime.tauriVersion` | 壳层 `tauri::VERSION`；浏览器形态为 `null` |
| 渲染引擎版本 | `appInfo.runtime.webviewVersion` | 桌面 `tauri::webview_version()`；浏览器由 ad-server 解析 `User-Agent`（`Edg/` → `OPR/` → `Firefox/` → `Chrome/` → `Version/`） |
| 系统 / 架构 | `appInfo.runtime.os` / `.arch` | `std::env::consts::{OS, ARCH}`；展示层映射为 `Windows · x64`，未知显示「未知」 |
| 日志目录 | `appInfo.runtime.logDir` | 后端解析的**有效**日志目录：debug 为仓库根 `.adl-logs`，release 为数据根 `logs` |
| 运行形态 | `appInfo.runtime.shell` | `tauri` / `browser` |
| 许可全文 | `aboutContent.ts::MIT_LICENSE_TEXT` | 必须与根目录 `LICENSE` 逐字一致（发布清单复核项） |
| 链接 | `aboutContent.ts::ABOUT_URLS` | 网站 `https://www.xiaogans.online/`、仓库、Issues |

`RuntimeInfo` 属于 `AppInfo` 契约（Rust `crates/types`），kernel 的 `app_info::build` 由调用方传入，
不反向依赖 tauri；两端各自填充，避免「同一个字段在两种形态下都猜错」。

## 4. 交互

- 外部链接：统一 `openUrlByMethod`，遵循用户「网址链接打开方式」（面板标签 / 中心标签 / 外部浏览器）。
- 许可 / 致谢 / 第三方声明：三个独立模态（`AboutTextDialog`），正文左对齐（模态挂在居中容器内，
  需显式覆盖 `text-align`）；Escape、遮罩点击、右上角关闭键可关闭，**不设底部按钮行**；打开时
  焦点进关闭键，关闭后归还焦点。许可正文用等宽可滚动区（宽版 600px）。
  - 致谢：字体与排版 / 图标与素材 / 图表与可视化 / 编辑器与预览 / 应用框架与基础设施 / 外部工具；
    条目含名称（可点击来源）、许可证短名与用途；结尾一段笼统致谢。
  - 第三方声明：当前收录随包素材与移植代码（bklit-ui / React Symbols / Untitled UI / Devicons）
    的版权行与许可全文（`<details>` 展开）；全量依赖由发布前生成任务补入。
- 打开日志目录：优先用 `appInfo.runtime.logDir`（后端解析的有效目录）；为空时回退
  `storage.getStatus()` 的 `logs` 分类路径，再调 `window.openPath(path)`。
- 不提供「复制诊断信息」与「环境」跳转：诊断单是 Node/Git/Bash/harness 的环境检测信息，
  与应用异常排障关联弱（首次运行向导与环境组已有入口）；环境组导航已在左侧设置导航中。

## 5. 新增 IPC：`platform_open_path`

- Rust：`src-tauri/src/commands/platform.rs::platform_open_path`（复用 `open_in_os_file_manager`，目录缺失时创建），
  注册于 `main.rs` + `permissions/digital-life.toml`。
- 桥接：`shared/ipc/window.ts::openPath`；tauri-bridge invoke；httpBridge `NOT_SUPPORTED` 桩；
  preview-bridge 走 `/system/open-path`（同机预览服务代为打开）；mock 返回成功。
- 双端一致性：浏览器模式由预览服务 `spawn` 系统文件管理器，用户感知行为与桌面端一致。

## 6. 明确延后

| 项 | 原因 | 落点 |
|----|------|------|
| 第三方声明（全量） | 当前只收录已知的随包素材与移植代码；全部 npm/Cargo 依赖需构建期扫描 lockfile 并生成许可全文 | `RELEASE-CHECKLIST.md` 第 1 节，发布前必做 |
| 构建 commit / 构建时间 | 无更新通道时页面无收益；排障靠诊断单 | 需要时加入诊断单，不上页面 |
| 检查更新 | 无发布源与版本清单 | 有发布流水线后再接 |
| Releases 链接 | 当前离线仓库且无 Release | 仓库转公开并出首个 Release 后补 |
| 商标行 | 未注册 | 注册后再加 |
| 官网产品页 | 目前 `xiaogans.online` 为作品集总入口 | 站点侧独立产品页 |

## 7. 验证

- 前端：`AboutSettings` 行为测试（渲染事实、两种链接落点、三个弹窗互不混排、致谢分组与许可证短名、
  第三方声明展开、打开日志目录、支持行只保留日志入口）；`SettingsPanel` / `settingsSearchAnchors` /
  `settingsGroups` 回归。
- 桥接：`window.openPath` 的 Tauri invoke 与 preview HTTP 路由各一条。
- Rust：`RuntimeInfo` 序列化形状、kernel 透传、UA 引擎解析。
- 全量门禁与双端人工验证按 `RELEASE-CHECKLIST.md` / `quality-gates.md` 执行。
