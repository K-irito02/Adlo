# 2026-08 Browser Knowledge

## Entries

- [浏览器面板网站元数据持久化缓存](./browser-site-meta-cache-2026-08-13.md) — favicon data-URI + 标题持久化缓存（三层架构），经验教训：三端语义一致、质量门控输入漂移、失败路径不能伪造成功值
- [浏览器面板历史导航与标题提取修复](./browser-history-navigation-2026-08-14.md) — C1 注入脚本历史 URL 归一化 + C2 前端智能回退 + 标题来源门控（provenance）+ can_go_back 原生 IPC。经验教训：HistoryChanged 去重窗口需按 ms 级、with_webview 异步投递需同步通道等待、注入脚本 IIFE 隔离、localStorage 持久化测试竞态
- [浏览器书签元组去重与标题隔离](./browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md) — 书签去重从「按网址」改为「(网址,标题)」元组语义 + 标签标题隔离 + 重复提示带语义化路径 + 悬停 title 语义化。经验教训：store 去重语义与 UI「已收藏」判断必须同步、多写入点需统一去重规则、删除/清理路径需元组键、标题双轨（标签=网站标题/书签=自定义标题）
- [浏览器 favicon 代理兜底移除与镜像合并守卫](./browser-favicon-proxy-removal-and-merge-guard-2026-08-18.md) — DDG/Google 代理图标不可靠且会被 should_replace_favicon 锁死 + 空广播清空镜像来回切换 + dedup 命中误判失败 + 退避短路携带真实 url + IconWorld 继承描边破坏填充图标 + 颜色 token 化。经验教训：失败路径返回当前最佳已知状态而非空、三端 isomorphic 短路路径逐字段对齐、外部兜底服务的"合法但错误"图标最隐蔽、图标工厂默认描边对填充 path 是破坏性、图标颜色走主题 token
- [搜索引擎设置弹层定位模糊与右边缘裁剪](./browser-search-engine-popover-tooltip-ref-subpixel-2026-08-23.md) — TooltipTrigger 覆盖子元素 ref 致锚点 null → 走 translate(-50%,-50%) 分支 → 弹层落半像素整体模糊 + 右边缘恒 left 展开被裁剪 + webview2 覆盖菜单。经验教训：亚像素模糊优先怀疑定位而非样式、复合触发组件可能吞并子元素 ref、防裁剪写成纯函数 + 边界单测、Phase 4 全清排查期 ADL 诊断日志
- [浏览器面板标签加载状态与跨域重定向 favicon 处理](./browser-tab-loading-redirect-favicon-2026-08-24.md) — 标签加载状态（favicon spinner + 标题扫光 + titleResolved 状态机）+ 跨域重定向 favicon 永久 spinner（方案 A 历史 URL 回写 + 方案 B redirectMap 兜底，参考 Chrome/Edge 重定向链消化语义）。经验教训：跨域重定向是 favicon 查找 miss 的隐蔽根因、期望导航必须绑定发起 tab id 且只用一次、titleResolved 初始化收敛到单一 isRealTitle helper、favicon degraded 后必须显示兜底字母、全局广播订阅用已归一化 key 避免重复解析
- [浏览器面板资源下载统一原生管线](./browser-download-unified-native-pipeline-2026-08-27.md) — 全类型资源下载统一走 WebView2 原生 DownloadStarting 管线（进度展示 + 记录 + 落盘默认路径，对齐 Chrome/Edge）。关键修复：下载链接 target 归一化不再仅限 `<a download>`（`target="_blank"` 与 new_window_handler DENY 冲突会取消下载）+ blob 落盘 async+spawn_blocking 防阻塞主线程 + 下载文件名净化防路径穿越/Windows 非法字符。经验教训：统一管线要对齐所有下载类型、静默 webview 下载被设计性取消、spawn_blocking(move) 闭包所有权陷阱（clone 供闭包外层保留）、失败上报 browser-download-error 事件
- [浏览器下载 URL 检测三端统一（query-key 解析）](./browser-download-url-detection-unify-2026-08-29.md) — Rust/JS/TS 三处 isDownloadUrl 扩展名集合与检测语义统一为「download 必须为独立 query key（大小写不敏感）」+ fragment 隔离 + 值内嵌字面 `?` 不误判。经验教训：三处实现一致性逐项人工比对、query 检测优先 URLSearchParams/query_pairs 而非子串正则、交叉同步注释必须描述真实语义（`.has()` 大小写敏感）、已知边界（`;` 分隔符分歧）显式记录
