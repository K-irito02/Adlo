# 二进制下载完整性校验（镜像回退 + 钉死哈希）

## 背景

Node.js / PortableGit 的宿主安装会在官方源失败后回退 npmmirror。此前只校验 URL
就解压 zip / 执行 7-Zip SFX，镜像一旦被劫持即可替换载荷。

## 结论

- **钉死版本用钉死哈希**：`env-baseline.json` 中的 `sha256` 是权威锚点，先于任何
  在线清单；镜像清单不能覆盖它。
- **最新版本先取官方清单**：Node 的 `SHASUMS256.txt` 优先从官方 dist 取，官方不可达
  才退同源清单（此时镜像仍可能同时替换 zip 与清单，属残余风险）。
- **Git 用发布方摘要**：GitHub Release API 的 asset `digest: sha256:...`；API 不可达
  回退 baseline 钉死哈希；两者都没有时 **fail-closed**，不执行 SFX。
- **校验必须在解压/执行之前**：失败删除 staging，绝不落盘执行未校验内容。
- **清单请求用独立短超时**：清单是小文本，不要复用 300s 的二进制客户端，否则受限
  网络下安装会静默卡 5 分钟。当前用 15s。
- **测试要覆盖决策点**：本地 `127.0.0.1` TCP stub 返回固定 zip，分别断言正确哈希
  `Ok`、错误哈希 `Err`；SFX 错误哈希必须在执行前失败。只测 `sha256_hex` 纯函数
  不算回归保护。
- **SFX 窗口用 `SW_HIDE` 隐藏**：`CREATE_NO_WINDOW` 只隐藏控制台，管不了 SFX 的
  GUI 进度窗；Windows 下用 `CreateProcessW` + `STARTF_USESHOWWINDOW` +
  `wShowWindow=0`。不要用 `-gm2`：官方 Git for Windows SFX 会忽略它，并可能以
  退出码 0 静默解压出 0 个文件。

## 相关文件

- `crates/adl-env/src/providers.rs`（`sha256_hex` / `verify_sha256` / 两个落盘函数）
- `crates/adl-env/src/providers/node.rs`（`pick_checksum` / `manifest_urls`）
- `crates/adl-env/src/providers/git.rs`（fail-closed）
- `crates/adl-env/src/latest.rs`（GitHub asset digest）
- `src-tauri/resources/env-baseline.json`（钉死哈希）
