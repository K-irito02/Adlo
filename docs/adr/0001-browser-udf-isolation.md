# 浏览器 WebView 按宿主分三个 UDF 隔离

**Status**: accepted

WebView2 的 `CoreWebView2Profile.PreferredColorScheme` 在同一用户数据目录（UDF）会话内实际是全局的（上游 WebView2Feedback #4920：即使 `ProfileName` 不同，新建控制器也会把其它窗口的主题一起改掉）。因此按宿主把 WebView 分成三组 UDF：面板与主界面沿用 Tauri 默认 UDF，中心使用独立 UDF，后台静默取标题/favicon 使用另一个独立 UDF。

## Considered Options

- **只换 `ProfileName`**：被上游缺陷否决——同一 UDF 内不生效，新建控制器仍会改写对端主题。
- **共用默认 UDF，创建后立即重设主题**：可行但不可靠，新建控制器的一帧会闪到对端主题，且需与创建时序赛跑。
- **按宿主分组独立 UDF**（选定）：以会话隔离换取主题互不干扰。

## Consequences

- 独立 UDF = 独立空 profile：中心与面板不共享 Cookie / localStorage / 缓存 / 登录态，升级后中心标签需重新登录一次。
- 磁盘常驻多份 WebView2 用户数据（默认 + center + silent），存储设置中 WebView2 归为不可迁移项。
- `app_data_dir()` 不可用时 fail-open 回默认 UDF 并留 warn 日志；此时跨宿主闪主题可能复发。
- 主界面 WebView 留在默认 UDF，不引入第四个环境。
