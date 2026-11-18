# 发布只走本地脚本，不引入 CI

**Status**: accepted（2026-11-18）

应用发布保持为**仓库内的本地 Node 脚本**：`release:bump`（四处版本号）、`release:build`（NSIS + 签名）、`release:publish`（GitHub + Gitee 双源）、`release:verify`（双源清单与安装包可达性）。**不引入 GitHub Actions 或其它云端 CI 来发布**；构建在发布者机器上完成，minisign 私钥与 Gitee 令牌只存在于本机（用户级环境变量或会话），不进入任何云端 Secret。

## Considered Options

- **GitHub Actions 全自动（tag 触发）**：公开仓库的 Actions 分钟数免费，产物可复现；但签名私钥必须存进云端 Secret、Gitee 上传还要再存一份令牌，首次构建约 30–50 分钟、失败调试一轮同样慢。对单人维护的项目，自动化收益低于「密钥离机」和「不用维护 workflow」的价值。
- **混合（Actions 出包 + 本地同步 Gitee）**：仍要把私钥放云端，只解决了 GitHub 侧；两份凭证暴露面没减少。
- **自建 runner 常驻**：密钥可以留在自有机器，但引入一台要长期在线的构建机与补丁维护，成本明显高于它解决的问题。
- **本次采用：纯本地脚本**：发布动作与已有构建链（`stage:sidecar`、`cargo tauri build`）在同一条命令里，密钥不出本机，排障直接看本机输出。

## Consequences

- 发布者机器需要 Rust 工具链、`gh` CLI、`TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` 与（可选的）`GITEE_TOKEN`；「推 tag 就自动出包」不再成立，发版是一次显式操作。
- 私钥与令牌不经过云端，代价是**备份责任在发布者**：私钥丢失即无法再给已安装用户推送更新（ADR-0026 已记录轮换预案）。
- 发布前必须先把版本号提交并推送：`release:publish` 默认拒绝脏工作区（`--allow-dirty` 才放行），tag 始终指向本机 HEAD。
- 可复现性弱于 CI：同一 tag 的产物取决于本机工具链版本，因此 `SHA256SUMS.txt` 与 Release 记录是同一次发布的唯一凭据。
- 触发重新评估的条件：出现第二位发布者、或发布频率高到「人工执行 + 本机环境」成为主要瓶颈时，应重新考虑 CI（届时优先解决密钥托管，而不是先搬流程）。
- 相关术语见 [GLOSSARY.md](../../GLOSSARY.md) 的「发布通道」「版本清单」「更新安装」。
