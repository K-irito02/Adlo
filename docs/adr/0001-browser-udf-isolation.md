# 浏览器 WebView 的 UDF 拓扑（默认共享，可回退隔离）

**Status**: accepted（2026-11-24 修订：默认共享；原「按宿主分三个 UDF 隔离」保留为关闭开关时的回退路径）

## 2026-11-24 修订（当前决策）

默认让**中心与右侧面板共用一个 WebView2 用户数据目录（UDF）**，由设置「浏览器 → 共享浏览配置文件」控制（默认开）。关闭该开关后回到原来的隔离拓扑：中心使用独立 UDF，面板沿用 Tauri 默认 UDF，后台静默取标题/favicon 使用另一个独立 UDF。

**动机（A/B 证据）**：冷启动的独立中心 profile 在内嵌 WebView 中打开 Google/Bing 时更容易触发风险控制/人机校验；共享 profile 后中心标签 5/5 → 0/5 触发，面板 0/5。共享还带来登录态、Cookie、缓存一次登录两边可用。代价是 `PreferredColorScheme` 在同一 UDF 内仍可能跨宿主联动（上游 WebView2Feedback #4920），因此共享模式下不再保证「中心与面板主题互不干扰」。

**回退路径**：设置关闭后，**仅对之后新建的标签**生效（标签在创建时快照该选择；挂起重建/重启恢复沿用快照）。需要隔离时用户可关闭开关并重开标签。

**保留的不变项**：后台静默 WebView 仍使用独立 UDF（不与可见标签共享会话）；`app_data_dir()` 不可用时 fail-open 回默认 UDF 并留 warn 日志。

## 原始决策（2026-07，已被上方修订取代）

> ~~WebView2 的 `CoreWebView2Profile.PreferredColorScheme` 在同一用户数据目录（UDF）会话内实际是全局的（上游 WebView2Feedback #4920：即使 `ProfileName` 不同，新建控制器也会把其它窗口的主题一起改掉）。因此按宿主把 WebView 分成三组 UDF：面板与主界面沿用 Tauri 默认 UDF，中心使用独立 UDF，后台静默取标题/favicon 使用另一个独立 UDF。~~

### Considered Options（原始）

- **只换 `ProfileName`**：被上游缺陷否决——同一 UDF 内不生效，新建控制器仍会改写对端主题。
- **共用默认 UDF，创建后立即重设主题**：可行但不可靠，新建控制器的一帧会闪到对端主题，且需与创建时序赛跑。
- **按宿主分组独立 UDF**（原选定，现为关闭开关时的回退）：以会话隔离换取主题互不干扰。

### Consequences（原始，仍适用于「关闭开关」的回退模式）

- 独立 UDF = 独立空 profile：中心与面板不共享 Cookie / localStorage / 缓存 / 登录态，升级后中心标签需重新登录一次。
- 磁盘常驻多份 WebView2 用户数据（默认 + center + silent），存储设置中 WebView2 归为不可迁移项。
- `app_data_dir()` 不可用时 fail-open 回默认 UDF 并留 warn 日志；此时跨宿主闪主题可能复发。
- 主界面 WebView 留在默认 UDF，不引入第四个环境。
