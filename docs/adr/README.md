# 架构决策记录（ADR）

按域分组的索引。新决策在 `docs/adr/` 用下一个编号新建，并在本表登记一行；被推翻的决策改 `Status` 并在此标「已废弃」。

## 工作区、文件变更与编辑器

- [0003 只监听当前工作区，焦点回归补刷兜底](./0003-watch-current-workspace-only.md) — **已废弃**，由 0018 取代
- [0015 本地 Git 初始化必须显式指定工作区路径](./0015-local-git-init-explicit-workspace.md) — 只创建本地 `.git`，不联网
- [0016 编辑器存盘分离草稿 / 已保存版本 / 外部版本](./0016-editor-save-pipeline-boundary.md) — 自写回声不触发冲突
- [0018 为所有已添加工作区各建监听根](./0018-multi-root-workspace-watchers.md) — 批次携带批次归属，按根刷新
- [0019 git 元数据通道：只改 `.git` 的操作也唤起刷新](./0019-git-metadata-watchers.md) — 多根盲区：gitdir/commondir 双监听，前端按 `.git/` 前缀只刷 git 快照

## 环境、Harness 与依赖

- [0004 Harness 版本管理收敛为通用层](./0004-harness-provisioning-without-bundling.md) — 取消安装包内置版本
- [0005 宿主托管 CLI 通过终端 PATH 注入生效](./0005-terminal-path-injection-for-hosted-cli.md)
- [0008 版本管理只保留单卡单行集合](./0008-version-card-single-row-set.md)
- [0010 宿主托管 OpenCode CLI 使用独立会话数据库](./0010-hosted-opencode-database-isolation.md)
- [0011 OpenCode CLI 2.x 与 1.x 共用一套版本管理 UI](./0011-opencode-2x-package-line.md)
- [0012 环境依赖通过进程级 PATH 注入生效](./0012-env-dependency-path-injection.md)

## 网络与来源

- [0006 自动检测代理不可达时静默改走直连](./0006-proxy-auto-silent-direct-fallback.md) — 自定义代理不回退
- [0007 设置项始终显示偏好，解析结果与可用性分列](./0007-auto-preference-vs-resolved-source.md)

## 设置与刷新

- [0009 设置刷新按行/块限定作用域，环境按依赖重检](./0009-settings-refresh-scope-and-recheck.md)

## 浏览器与预览

- [0001 浏览器 WebView 按宿主分三个 UDF 隔离](./0001-browser-udf-isolation.md)
- [0002 文件预览用无文字扫光占位并按文件身份缓存](./0002-preview-loading-and-cache.md)
- [0017 书签为独立实体，导入导出保留来源标签弱引用](./0017-bookmark-transfer-and-identity.md) — 书签条目与活标签页解耦
- [0020 网站图标以共享镜像为真源，书签图标快照只播种不落持久层](./0020-site-icon-mirror-and-bookmark-snapshot.md) — 快照不写持久层，真实图标可覆盖；被动行首字母占位
- [0021 站点元数据失败墓碑持久化 + 请求键别名回写](./0021-site-meta-failure-tombstone-and-alias-backfill.md) — 失败不再零缓存；重定向站点请求键别名回写
- [0022 本地文件按可信文档打开，WebView2 环境参数全应用一致](./0022-local-file-trust-and-webview2-environment.md) — 同 UDF 参数逐字一致，可渲染扩展白名单
- [0023 智能体文件链接的未知工作区：内存隐藏工作区（superseded）](./0023-agent-link-unknown-workspace-registration.md) — 原「登记为已添加工作区」已由同日修订取代：不登记侧栏、内存隐藏根、保存前读盘比对
- [0024 智能体站点规则合并：站点优先、同 id 替换、停用只作用全局](./0024-agent-site-rule-merge-order.md) — 规则顺序有语义；停用站点规则不回退全局同 id；命中需可解析目标
- [0025 内部拖拽使用 Pointer Events，保留 Tauri 原生文件拖入](./0025-pointer-events-for-internal-drag.md) — HTML5 DnD 与 `dragDropEnabled` 互斥；内部拖拽走 pointer，原生文件拖入保留

## 品牌、工具链与 Git 可视化

- [0013 品牌改名后保留 `adl` 工程前缀](./0013-retain-adl-prefix-after-rename.md)
- [0014 分支配色优先保持稳定，超过色板容量时允许复用](./0014-stable-branch-color-assignment.md)
