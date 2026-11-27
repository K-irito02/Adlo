# 下载卡片文件状态与路径迁移经验（2026-11-27）

## WebView2 下载链路

- **隐藏 / 离屏 WebView 不发起 `DownloadStarting`**：隐藏 builder、可见 builder + 1×1、about:blank + show + navigate 三种变体均实测无下载记录、服务端无请求。不要把下载链接路由到新建（哪怕是离屏）标签 / WebView；带 `download` 属性或明确下载扩展名的普通链接应在当前 WebView 同文档触发原生下载。
- **同文档导航要抑制地址栏更新**：`DownloadStarting` 会中止文档导航，`browser-url-changed` 仍可能带下载 URL 到达；`useBrowserUrlChange` 应按「当前标签不是下载 URL」守卫，保留页面 URL / 历史 / 地址栏。
- **改用隐藏 iframe 的边界**：普通 `target=_blank` 下载链接改为 `display:none` iframe 后，真实 WebView2 是否稳定触发 `DownloadStarting`、30s 移除 iframe 对超大下载的影响、站点 `X-Frame-Options` 均需真机手工验收；jsdom 只能证明不发 `open-new-tab` 且创建了隐藏 iframe。

## 记录复用

- **`reset_for_redownload` 必须更新 `url`**：`handle_download_finished` 与进度监控都按 `record.url` 查找记录 / 原生 operation。兜底本就为重定向 / 签名 URL 变化而存在，若复用时保留旧 URL，完成事件匹配不上，只能靠字节轮询兜底甚至长期停在 `in_progress`。
- **pending 兜底要限定 tab**：单槽 pending 的兜底只允许「同 tab URL 变化」或「注册时无 tab 的无活动标签回退」。不限定 tab 时，15s 窗口内任意无关下载都会抢走 pending，原记录永远等不到 started，前端反而误报「重新下载未开始」。
- **准备态定时器要随记录一起撤销**：15s fallback toast 的 timer 记录在模块级 Map；移除记录 / 删除文件 / 清空历史时若只清 `redownloadingIds` 不清 timer，会对已删除记录弹多余错误 toast。

## 错误哨兵与审查

- **Tauri 命令 Err 经 `AppError::Internal` 会带 `Internal error: ` 前缀**，且 `invoke` 以普通对象 `{code, message}` reject（`String(e) === '[object Object]'`）。跨 IPC 的哨兵匹配要用 `includes` 并从对象里显式取 `.message`；严格 `===` 只在前端自己生成 message 时成立（如 `REFRESH_FAILED`）。
- **测试 mock 必须复刻真实消息形状**：把哨兵写成裸 `'downloads_active'` 会让严格相等的缺陷在测试里全绿。补一条从 plain-object rejection 进入的用例，删除性推演才会变红。
- **注释要跟最终流程一起改**：把 `target=_blank -> window.location.assign` 改成隐藏 iframe 后，`useBrowserUrlChange` 里描述旧触发方式的注释若不更新，会成为审查中的事实漂移项。
- **切换控件 a11y**：`role="switch"` + `aria-checked` 时，可访问名称必须恒定；动态 `title` 只能作 tooltip，需补恒定 `aria-label`。
