# dsh 0.2.x 一次性 token 认证：authenticated URL 捕获 + 版本目录 — 2026-10-19

`@deepseek-ai/dsh` 从 0.1.x 升到 `0.2.0-rc.2` 后引入 `BrowserAuth`：
裸 `http://127.0.0.1:3080/` 直接 `401`（正文 `dsh web authentication required; reopen the URL
printed by dsh web.`），真实入口是 stdout 打印的一次性链接
`http://127.0.0.1:3080/?token=xxx`（首次访问种 HttpOnly cookie，后续靠 cookie）。

## 宿主必须捕获 stdout 打印的 URL，而不是拼裸地址

- 旧逻辑只做 TCP 连通检查、返回裸 `http://127.0.0.1:3080/` → 必 401。
  新版 dsh 先监听端口**后**打印 URL，两者有短暂窗口：端口就绪后等待 stdout 行
  （最多 5s，轮询非固定 sleep），用捕获到的 authenticated URL 作为进程句柄 URL。
- `spawn` 必须 `stdout/stderr` 双管道 + 后台持续 drain（防管道填满阻塞子进程），
  顺带从 stdout 解析 URL；`marker` 参数化（dsh 传 `DSH_URL_MARKER`），其它站点传各自 marker 复用同一管线。
- 运行态探测（`detect_running_dsh`）的 HTTP 检查同样要认 401 指纹：
  `status == 401 && body.contains("dsh web authentication required")` 即视为运行中，
  否则每次误判未运行而重复 spawn 撞 `EADDRINUSE`。

## token 是凭据，禁止进日志（治理红线）

- 启动打印的 URL 含一次性 `?token=`，属于凭据：info/error/debug 日志一律先脱敏
  （`redact_url_for_log` 去 query/fragment；整行日志用 `redact_token_param` 把值替换为 `<redacted>`）。
- 教训：脱敏必须覆盖**全链路**（stdout 整行、捕获 URL 的 info、超时 error），漏掉 stderr 一处即被 P4 审查拦下。
  审查时用“凭据进日志”专项 grep（`token=` 原文、`?token=` 整行）比肉眼可靠。

## 版本语义：dist-tag `latest` 可能指向 rc

- 当前 registry 的 `latest` 标签指向的也是 rc（如 `0.2.0-rc.2`）。
  “升级”语义必须是**最新正式版**（packument 正式版桶最大；dist-tag 仅当其本身为正式版时才可作回退），
  不能直接拿 dist-tag 当稳定版。预发布走独立通道（`next` → `alpha` → 桶首），
  “未知”（目录拉取失败）与“暂无”必须用独立状态区分展示，不得误报“已是最新”。

## 附：Windows 上 `git diff | Set-Content` 快照中文乱码坑

- PowerShell 管道按 `[Console]::OutputEncoding`（中文系统默认 GBK）解码 git 的 UTF-8 输出，
  再按目标编码写入——中文注释会被改写成乱码（含不可见的 U+200C 零宽字符污染）。
  做 `.review-diffs/` 这类文本快照前必须先执行
  `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`，并用 `Set-Content -Encoding utf8` 写盘，
  事后用字节级检查（搜 `E2 82 AC`）确认无污染。源文件本身始终干净，坏的是快照管线。
