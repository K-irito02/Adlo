# WebView2 PreferredColorScheme 按 UDF 会话隔离 + 后端主题初始化状态位（2026-10-06）

## 教训 1：`PreferredColorScheme` 在同一 UDF 会话内实际全局

- 官方文档称它是 profile 级（"只影响与该 profile 关联的 WebView"），但实测（及上游
  [WebView2Feedback #4920](https://github.com/MicrosoftEdge/WebView2Feedback/issues/4920)，
  仍 Open）表明：同一用户数据目录（UDF）下即使 `ProfileName` 不同，新建控制器也会把
  其它窗口的主题一起改掉，Edge 本体亦可复现。
- 仅换 `ProfileName` 不可靠；要隔离主题回退，必须按 UDF/会话隔离（不同目录 = 不同
  会话/浏览器进程）。wry/Tauri 按 `data_directory` 建环境，`WebviewBuilder::data_directory`
  即分组开关（Tauri 全平台 API，无需 cfg 门控）。
- 代价：独立 UDF = 独立空 profile（cookie/localStorage/登录态不共享）+ 额外浏览器进程
  与磁盘占用。本项目取舍：面板沿用默认 UDF（保留既有会话），中心/silent 各走独立 UDF
  （中心升级后需重新登录一次，已获产品确认）。

## 教训 2：后端主题必须有"是否已显式同步"状态位

- `BrowserManager` 主题曾硬编码默认 `dark`；创建闭包为防"创建与闭包之间切换主题"竞态而
  重读后端值——但在启动窗口内后端值是从未初始化的默认值，重启恢复的首个 WebView
  会落到旧主题（日志实证：前端传参 `light` 正确，闭包读到 `latest_cs="dark"`）。
- 修复：`theme_initialized` 原子标志（`set_color_scheme_for_all` 置位）；未初始化时用
  创建时刻前端值（localStorage 解析，重启时正确），初始化后永远用后端最新值。
- 派生规则：命令签名接受任意字符串时，在入口统一归一化（本项目 `"light"` 保留、
  其余一律 `"dark"`），避免首帧背景与 Profile 分裂；`colorScheme=None` 且未初始化时打 warn。
