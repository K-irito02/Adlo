# 环境依赖 Runbooks（索引）

本目录只是索引，**不存放 runbook 正文**。

## 唯一真源

六份 runbook 的正文位于前端源码目录：

`ai-digital-life/frontend/src/app/features/environment/runbooks/`

原因：设置面板「复制给助手」按钮需要把 runbook 全文随诊断载荷一起复制。正文放在前端目录并以
`?raw` 静态导入（`runbooks/index.ts`），会打进前端包，Tauri 桌面与浏览器模式都能直接取用，
无需运行期读取文件系统或额外 IPC。若再在 `docs/` 下复制一份正文，两处内容必然随时间漂移，
因此这里只保留索引与指向。

新增或修改 runbook 时，请只改前端目录下的 Markdown；本索引仅在增删文件时同步。

## 索引

| 依赖       | 文件                                                                                                                    | 适用场景                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Node.js    | [env-node.md](../../ai-digital-life/frontend/src/app/features/environment/runbooks/env-node.md)                         | 助手起不来、Node 缺失或版本过低    |
| Git / Bash | [env-git-bash.md](../../ai-digital-life/frontend/src/app/features/environment/runbooks/env-git-bash.md)                 | Git 面板为空、Bash 不可选          |
| WebView2   | [env-webview2.md](../../ai-digital-life/frontend/src/app/features/environment/runbooks/env-webview2.md)                 | 窗口空白或应用起不来               |
| adl-server | [env-adlserver.md](../../ai-digital-life/frontend/src/app/features/environment/runbooks/env-adlserver.md)               | 业务功能不可用、只剩系统能力       |
| 下载通道   | [env-net-download.md](../../ai-digital-life/frontend/src/app/features/environment/runbooks/env-net-download.md)         | 安装下载失败（`EAI_AGAIN` / 超时） |
| 模型凭据   | [env-model-credential.md](../../ai-digital-life/frontend/src/app/features/environment/runbooks/env-model-credential.md) | 助手能打开但不能回答               |

## 结构约定

每份 runbook 固定五段，顺序一致：

1. `症状`
2. `检测命令`
3. `安装步骤`
4. `装后回填`
5. `回滚`

## Bash 来源（PortableGit 含 Bash）

宿主托管的 Git 资产是 **PortableGit**，自带 `bin/bash.exe`，所以 Git 的宿主副本
同时提供 Bash。Bash 也可来自：系统完整 Git for Windows（`<Git>\bin\bash.exe`）、
WSL、MSYS2，或用户在设置组手动填写的路径。宿主 Git 安装失败时 Bash 会连带不可用，
这是预期行为。

## 复制载荷

「复制给助手」输出一份 **Markdown 诊断单**（不是 JSON 外套 JSON），正文顺序：

1. **给你的任务** — 分类、修复步骤、验证方式、禁止删除个人文件/关闭安全软件等约束。
2. **应用与运行环境** — 应用版本、运行模式（Tauri/浏览器）、界面语言、生成时间、UA、数据根。
3. **问题项** — 未就绪项优先；模型凭据只作为引导行，不参与就绪计数。
4. **原始检测数据** — 一个 ```` ```json ```` 代码块，字段为
   `{ dep, label, baseline, dataDir, status, context }`；`status` 是真实对象（单依赖为对应段，
   `all` 为整包 `EnvStatus`，`net` 为 `netprobe`，`model` 为合成的
   `{ ciTokenConfigured, dshReady }`），`context` 含应用版本/模式/语言/时间/UA。
5. **应用内置排障手册** — runbook 原文去掉 YAML frontmatter，标题整体降两级后内联。
6. **期望回复格式** — 诊断结论 → 修复步骤 → 验证方式。

- `baseline: string | null` — 该依赖的基线版本。`bash` / `adlserver` 的 wire 是空串，载荷归一为 `null`；
  `net` / `model` 没有 `baselineVersion` 字段，载荷固定 `null`；`all` 聚合为 `null`。
- 依赖映射：`node → env-node`、`git / bash → env-git-bash`、`webview2 → env-webview2`、
  `adlserver → env-adlserver`、`net → env-net-download`、`model → env-model-credential`。
- `dep = "all"` 时只拼接**未就绪项**的 runbook（Git 与 Bash 共用一份时只出现一次）；
  网络未连通会收录 `env-net-download`；模型行没有可检测就绪信号，不参与 `all` 聚合。

## 内容红线

- 中文为主，命令与路径按原样保留。
- 只出现官方来源：nodejs.org、Git for Windows 官方发布页、微软 WebView2 官方下载页、
  `registry.npmjs.org`；
  dsh 的模型配置入口按界面泛化描述，不写死内部地址。
- 凭据一律用占位符 `<你的 Key>`；禁止真实 Key、个人目录、内网域名与本机地址。
- 自动化守卫见 `ai-digital-life/frontend/src/app/features/environment/runbooks.test.ts`（五段标题 + 禁止字符串）。
