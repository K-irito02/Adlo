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

## Bash 来源（MinGit 不含 Bash）

宿主内置的 Git 资产是 **MinGit**，不含 `bash.exe`。Bash 只能来自：系统完整
Git for Windows（`<Git>\bin\bash.exe`）、WSL、MSYS2，或用户在设置组手动填写的路径。
runbook 与设置组文案不得声称「Bash 随宿主 Git 一起安装」。

## 复制载荷

「复制给助手」输出 JSON，完整形状为
`{ dep, statusJson, baseline, runbook, dataDir, copyContext }`：

- `statusJson: string` — 单依赖行（`dep = "all"` 时为整包 `EnvStatus`）的 JSON 文本。
- `baseline: string | null` — 该依赖的基线版本；版本无关项（`bash` / `net` / `model`）
  与 `all` 聚合为 `null`（wire 上是空串，载荷归一为 `null`）。
- `runbook: string | null` — 该依赖对应的 runbook 全文。
- `dataDir: string` — 环境检测使用的数据根（`EnvStatus.dataDir`），助手可据此定位
  `env-hosted/`、配置与日志。
- `copyContext: { source, bridge, locale, copiedAt }` — 复制来源与环境元信息。
- 依赖映射：`node → env-node`、`git / bash → env-git-bash`、`webview2 → env-webview2`、
  `adlserver → env-adlserver`、`net → env-net-download`、`model → env-model-credential`。
- `dep = "all"` 时只拼接**未就绪项**的 runbook（Git 与 Bash 共用一份时只出现一次）；
  所有可检测项都就绪时为 `null`。模型行没有可检测就绪信号，不参与 `all` 聚合。

## 内容红线

- 中文为主，命令与路径按原样保留。
- 只出现官方来源：nodejs.org、Git for Windows 官方发布页、微软 WebView2 官方下载页、
  `registry.npmjs.org`；
  dsh 的模型配置入口按界面泛化描述，不写死内部地址。
- 凭据一律用占位符 `<你的 Key>`；禁止真实 Key、个人目录、内网域名与本机地址。
- 自动化守卫见 `ai-digital-life/frontend/src/app/features/environment/runbooks.test.ts`（五段标题 + 禁止字符串）。
