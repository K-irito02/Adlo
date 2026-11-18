---
name: adlo-release
description: 发布 Adlo 桌面应用的新版本——GitHub + Gitee 双源 Release、minisign 签名、NSIS 安装包与 latest.json 清单，并用 verify 自检两个更新源。当用户说「发版 / 发布新版本 / 打个 tag / 升版本号 / 同步 Gitee / 补发 Release / 客户端收不到更新 / 检查更新清单」时使用。
---

# Adlo 发版（本地脚本版）

发布链路的设计依据是 [ADR-0026](../../../docs/adr/0026-app-update-via-official-updater-dual-source.md)（官方 updater + 双源清单）
与 [ADR-0027](../../../docs/adr/0027-update-install-without-confirmation-dialog.md)（安装前不弹确认）。
本技能只描述**怎么把一版安全地发出去**；发布前的人肉核验项仍以根目录 `RELEASE-CHECKLIST.md` 为准。

## 一次性准备

| 项 | 说明 |
| --- | --- |
| 签名私钥 | `%USERPROFILE%\.tauri\adlo.key`（仓库外）；公钥已写进 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` |
| 签名密码 | 用户级环境变量 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（脚本会从环境或 HKCU 读，不打印） |
| Gitee 令牌 | 用户级环境变量 `GITEE_TOKEN`（32 位私人令牌，仓库与发行版权限） |
| GitHub CLI | `gh auth status` 必须是已登录状态 |

私钥丢失 = **已安装用户永远收不到自动更新**；泄露 = 更新通道被接管。备份两份离线介质，别进仓库。

## 发版流程

1. **确认环境**：`git status --short` 干净；`git branch --show-current` 是本次要发的分支；确认目标版本号（`X.Y.Z`，tag 为 `vX.Y.Z`）。
2. **门禁**：至少 `pnpm --dir adlo/frontend run check:changed` + `pnpm --dir adlo run cargo:clippy`；合并/发布前按 `.agents/rules/quality-gates.md` 跑 `check:all`（全量需用户批准）。
3. **升版本号**（四处同步，脚本负责）：
   ```powershell
   pnpm --dir adlo run release:bump -- 0.1.1
   ```
4. **写发布说明**：测试版必须写明「测试版本（非正式发布）」；不写功能宣传。不传 `--notes-file` 时脚本用 `defaultTestNotes()` 生成。
   ```powershell
   # .release/notes.md（该目录已 gitignore）
   ```
5. **构建 + 签名**：
   ```powershell
   pnpm --dir adlo run release:build
   ```
   产物在 `adlo/target/release/bundle/nsis/`：`Adlo_<ver>_x64-setup.exe` 与同名 `.exe.sig`。缺 `.sig` 说明 `createUpdaterArtifacts` 没生效或密钥没读到，**不要继续发布**。
6. **发布双源**：
   ```powershell
   pnpm --dir adlo run release:publish -- --tag v0.1.1 --notes-file .release/notes.md
   ```
   脚本做四件事：GitHub `gh release create` 上传 exe/sig/latest.json/SHA256SUMS → Gitee 建 Release → 传附件 → 更新 Gitee 仓库文件 `release/latest.json`。
7. **自检两个更新源**：
   ```powershell
   pnpm --dir adlo run release:verify -- --tag v0.1.1
   ```
   期望两行 `OK`（Gitee raw 清单 + GitHub releases/latest 清单，各自版本匹配且安装包 HEAD 可达）。
8. **安装冒烟**：装 `Adlo_<ver>_x64-setup.exe` → 启动 → 设置·关于页版本号正确 → 手动「检查更新」返回「已是最新」。
9. **回归更新链路**（发新版时）：在**旧版本**里等铃铛通知或手动检查 → 下载（铃铛出现绿点）→ 卡片「安装」→ 重启后关于页是新版本。至少跑一次「代理关闭」和一次「代理开启」。

## 必须守住的约束

- **不要给最新版打 prerelease 标记**：GitHub 的 `releases/latest` 会跳过预发布，清单地址直接 404，所有客户端表现为「永远已是最新」。
- **只发 NSIS**：MSI / 绿色包不参与自动更新，发布它们会产生两份安装记录。
- **版本号只有一个真源**：`src-tauri/tauri.conf.json`；`Cargo.toml` 与两个 `package.json` 由 `release:bump` 同步，CI 之前也要靠人核对。
- **Gitee 清单是仓库文件**：raw 直链有 CDN 缓存，`verify` 刚失败时先等 1–2 分钟再重试；仍失败再查 Gitee 令牌权限与 `release/latest.json` 是否真的落在 `main`。
- **Gitee 附件有大小上限**：安装包超限时先查 Gitee 配额，不要改成分片。
- **签名密钥不可随手轮换**：确需轮换，先发一个「同时内置新旧公钥、用旧私钥签名」的桥接版本，再下一版切新密钥。

## 失败处置

| 现象 | 处置 |
| --- | --- |
| GitHub 成功、Gitee 失败 | GitHub 侧已对外可见，优先补 Gitee：手工建 Release + 传附件 + 更新 `release/latest.json`，不要重跑整个 `publish`（会因 tag 已存在而失败） |
| `verify` 报清单版本不符 | 多半是 Gitee 清单没更新成功（缓存或权限）；重新执行清单更新步骤后重试 |
| `verify` 报安装包 HEAD 非 200 | 附件没传成功或文件名与清单不一致；核对 `Adlo_<ver>_x64-setup.exe` |
| 构建报缺少 `.sig` | 检查 `TAURI_SIGNING_PRIVATE_KEY`（路径或内容）与密码是否可读 |
| `build-stage-sidecar.ps1` 报 cargo 参数错误 | 该脚本曾因 splat 单元素数组把 `--release` 拆成单字符；已改成显式子命令分支，勿再引入 `@ProfileArgs` |

## 自检清单

- [ ] `git status` 干净，分支正确，tag 与 `tauri.conf.json` 版本一致
- [ ] 门禁通过（至少 affected 范围）
- [ ] 四处版本号一致
- [ ] `setup.exe` + `.sig` 都存在
- [ ] 发布说明写明测试/正式性质
- [ ] `release:verify` 两行 OK
- [ ] 安装冒烟通过（版本号正确、检查更新可用）
- [ ] 记录：版本号、两个 Release 链接、SHA-256、验证时间与网络条件（代理开/关）
