---
name: adlo-release
description: 发布 Adlo 桌面应用的新版本——三处版本号同步、GitHub + Gitee 双源 Release、minisign 签名、NSIS 安装包与 latest.json 清单，并用 verify 自检两个更新源；也覆盖只构建不发布的本地签名包与离线验签。当用户说「发版 / 发布新版本 / 打个 tag / 升版本号 / 同步 Gitee / 补发 Release / 只构建不发布 / 客户端收不到更新 / 检查更新清单」时使用。
---

# Adlo 发版（本地脚本版）

依据 [ADR-0026](../../../docs/adr/0026-app-update-via-official-updater-dual-source.md)、
[ADR-0027](../../../docs/adr/0027-update-install-without-confirmation-dialog.md)、
[ADR-0028](../../../docs/adr/0028-local-release-scripts-only.md)；发布前法务核验仍以 `RELEASE-CHECKLIST.md` 为准。

## 三条硬规则

1. **版本号真源是 `adlo/src-tauri/tauri.conf.json`**。`release:bump` 同步**三处**（tauri.conf + 两个 `package.json`）；
   `adlo/Cargo.toml` 的 workspace 版本是 crate 版本，**脚本刻意不动**——改它会让全部 crate 重编。
2. **tag 指向本机 HEAD**。`release:publish` 默认拒绝脏树；bump 后必须 **commit + push**，GitHub 与 Gitee 都要有该 commit。
   不要用 `--allow-dirty`：tag 会钉在不含新版本号的提交上。
3. **发布打包前必须过全量门禁并获批准**。日常 affected 检查不能替代 `check:all` + 双端验证；
   `quality-gates.md` 要求先通知用户并获批准，不得自行执行。

## 一次性准备

| 项 | 说明 |
| --- | --- |
| 签名私钥 | `TAURI_SIGNING_PRIVATE_KEY`（内容或路径）→ `TAURI_SIGNING_PRIVATE_KEY_PATH` → 默认 `%USERPROFILE%\.tauri\adlo.key`；公钥在 `tauri.conf.json` 的 `plugins.updater.pubkey` |
| 签名密码 | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（环境或 HKCU；`setx` 后无需重开终端） |
| Gitee 令牌 | `GITEE_TOKEN`（仓库读写 + 发行版权限；长度是外部易变事实，不写死） |
| GitHub CLI | `gh auth status` 已登录 |
| 网络/磁盘 | `pnpm --dir adlo run probe:net`；release 构建建议剩余 ≥ 25 GB |

私钥丢失 = 已安装用户永远收不到更新；泄露 = 通道被接管。备份两份离线介质，别进仓库。

## 正式发布

1. **环境**：`git status --short` 干净、分支正确、`git pull --ff-only`；`dev:stop`；`probe:net`；`gh auth status`；
   确认目标 `X.Y.Z`（tag `vX.Y.Z`）。
2. **tag 预检**：`git ls-remote --tags origin vX.Y.Z` + Gitee「标签」页。已存在且不是本次 HEAD 就先删
   （GitHub `gh release delete vX.Y.Z --cleanup-tag`；Gitee 网页删），否则 `gh release create` 会复用旧 tag。
3. **门禁**：日常 `pnpm --dir adlo/frontend run check:changed` + `pnpm --dir adlo run cargo:clippy`；
   打包前 `pnpm --dir adlo run check:all` + 双端验证，**先获用户批准**。
4. **升版本号（三处）**：
   ```powershell
   pnpm --dir adlo run release:bump -- 0.1.1
   ```
   核对 `tauri.conf.json` / `adlo/package.json` / `adlo/frontend/package.json`；`Cargo.toml` 仍是旧值，这是对的。
   依赖有变化时先 `notices:generate` 并提交生成物（`release:build` 会离线复核）。
5. **写发布说明**：`.release/notes.md`（已 gitignore）。首段就是卡片摘要（客户端只取第一个非空段落并剥 Markdown），
   不要用标题/列表开头；全文 ≤ **4000 字符**；测试版写明「测试版本（非正式发布）」；
   **正式发布必须传 `--notes-file`**，不传时脚本用测试版默认文案。
6. **提交 + 推送**：
   ```powershell
   git add adlo/src-tauri/tauri.conf.json adlo/package.json adlo/frontend/package.json
   git commit -m "chore(release): v0.1.1"
   git push origin main
   ```
   **Gitee 必须在 publish 之前有同一 commit**（`git push https://gitee.com/K_irito/Adlo.git main` 或网页同步）；
   顺序反了会用 GitHub 内容覆盖刚写入的 `release/latest.json`。
7. **构建 + 签名**（长命令，输出落盘）：
   ```powershell
   pnpm --dir adlo run release:build:log
   pnpm --dir adlo run wait:logged -- --name release-build
   ```
   先移走同版本旧产物（脚本只检查存在性，不检查新鲜度）。产物 `Adlo_<ver>_x64-setup.exe` + `.sig`；
   必须看到 `installer hooks verified`；缺 `.sig` 停止发布。本地密码学验签见
   [references/local-signature-verification.md](./references/local-signature-verification.md)。
8. **发布双源**：
   ```powershell
   pnpm --dir adlo run release:publish -- --tag v0.1.1 --notes-file .release/notes.md
   ```
   GitHub 上传 exe/sig/latest.json/SHA256SUMS.txt → Gitee 建 Release + 传 exe/sig/SHA256SUMS.txt →
   contents API 提交 `release/latest.json` 到 Gitee **默认分支**。默认分支必须是 `main`（客户端读 `raw/main/`）。
9. **自检两个源**：
   ```powershell
   pnpm --dir adlo run release:verify -- --tag v0.1.1
   ```
   两行 `OK`。**边界**：不验签、不验 tag 指向、不验 Gitee 附件集合；首版必须在干净机器上完成一次真实安装与旧→新升级。
10. **冒烟**：新装 → 关于页版本正确 → 检查更新「已是最新」；再在**旧版本**里等铃铛/手动检查 → 下载（绿点）→
    安装 → 重启后新版本。代理关闭、开启各一次。
11. **记录**：版本、两个 Release 链接、SHA-256、verify 时间、网络条件。

## 只构建不发布（本地签名包）

- 首次本地试用包可以保持当前版本（不 bump）；需要覆盖已安装版本或验证旧→新升级链路时，先 `release:bump X.Y.Z`。
- 构建：
  ```powershell
  pnpm --dir adlo run release:build -- --local
  ```
  `--local` 在构建后把 exe / sig / SHA256SUMS.txt 复制到**仓库根** `.release/local/v<ver>/`（gitignored，不受 `cargo clean` 影响；不是 `adlo/.release/`），并打印版本、SHA-256 与安装提示。
- 归档到固定目录（本机约定 `E:/AI-DIGITAL-LIFE/Adlo-builds/`，避免每次翻深层 `.release`）：
  ```powershell
  $ver = '0.1.0'                                   # 与 tauri.conf.json 保持一致
  $sha = git rev-parse --short HEAD
  $dest = "E:/AI-DIGITAL-LIFE/Adlo-builds/v$ver-$sha"
  New-Item -ItemType Directory -Force $dest | Out-Null
  Copy-Item ".release/local/v$ver/*" $dest
  ```
  目录名带短 SHA，用于区分「同版本、不同提交」的试用包；归档目录只放安装包 / 签名 / 校验和，不参与更新检查。
- 构建前移走同版本旧产物；确认 `.exe`/`.sig` 时间戳与 `trusted comment` 里的 `file:`/`timestamp`；**不要跑 `release:verify`**（它读线上清单，未发布必失败且不验签）。
- 本地验签：`node adlo/scripts/verify-local-signature.mjs <ver>`，期望 `SIGNATURE_OK= true`。
- 安装冒烟：运行 setup → 关于页版本正确 → 启动应用。未发布时应用内「检查更新」没有线上源，属预期。
- 数据根：安装版用 `%APPDATA%\com.adlo.app`，与 dev 工作树的 `.adl-instance` 隔离；长期试用前重新添加工作区/书签，或先迁移数据根。

## 必须守住的约束

- **只发稳定通道**：`publish --prerelease` 直接拒绝；版本号只用 `X.Y.Z`。`releases/latest` 会跳过预发布
  （有旧正式版时回退到它，不是必然 404）。
- **只发 NSIS**：MSI / 绿色包不参与自动更新，会产生两份安装记录。
- **Gitee 清单是仓库文件**：`raw/main/` 有 CDN 缓存；默认分支必须是 `main`；刚提交后等 1–2 分钟。
- **Gitee 附件有大小上限**：超限先查配额，不要改成分片。
- **密钥轮换**：先发「新旧双公钥、旧私钥签名」的桥接版，再切新密钥。
- **不要手工只传 exe 建 Release**：页面正常但清单没更新，客户端永远收不到更新。

## 失败处置

| 现象 | 处置 |
| --- | --- |
| `working tree is dirty` | 回第 6 步 commit + push；不要 `--allow-dirty` |
| tag / 版本不符 | 确认三处版本与 tag 一致后重跑 |
| tag 已存在但 Release 不存在 | `gh` 会复用旧 tag；先删 tag 再发 |
| GitHub 成功、Gitee 失败 | **不重跑 publish**：① 确认 Gitee 有该 commit；② 网页建 Release（target `main`）；③ 传 `Adlo_X.Y.Z_x64-setup.exe`、`.exe.sig`、`.release/vX.Y.Z/gitee/SHA256SUMS.txt`；④ 把 `.release/vX.Y.Z/gitee/latest.json` 提交到 Gitee `release/latest.json`；⑤ 重跑 verify |
| Gitee Release 已建 / 附件不全 / 重试 400/409 | 只补缺附件与清单，不再 create |
| verify 版本不符 | 先确认默认分支 `main` 与 raw 文件存在 → 等缓存 1–2 分钟 → 查令牌权限 |
| verify HEAD 非 200 | 附件没传成功或文件名与清单不一致 |
| build 缺密钥/密码 | 查三种密钥入口与 HKCU 密码；`setx` 后无需重开终端 |
| publish 缺 `signature` | `createUpdaterArtifacts` 失效或产物被清；不是密钥问题（build 前已校验） |
| `installer.nsi` 缺 hooks | 恢复配置重建，否则升级被 `adl-server.exe` 锁 |
| `.sig` 是旧包 | 构建前没清同版本旧产物；重建并核对 `trusted comment` |
| 包坏了 | 客户端只接受更高版本：bump 下一版重发；不要把删 Release 当回滚 |

## 自检清单

- [ ] 分支正确、HEAD 已推送；tag 不存在或指向本次 HEAD
- [ ] 三处版本一致；`Cargo.toml` 未动
- [ ] `check:all` + 双端验证通过并获批准
- [ ] 依赖有变化时 `notices:check` 通过
- [ ] `setup.exe` + `.sig` 为本次产出；verify 两行 `OK`
- [ ] notes 首段可独立成句、≤ 4000 字符、性质写明
- [ ] 干净安装 + 旧版本→新版本升级通过（代理开/关）
- [ ] 记录版本、链接、SHA-256、验证时间与网络
