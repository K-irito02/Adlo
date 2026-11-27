# Retro Environment Tooling Design

## Intent

把本次集成/打包 Retro 的 6 项问题变成可重复执行的工具与明确规则，减少长命令超时、测试竞态、审查报告往返、本地打包手工步骤和 Retro 证据重建成本。

## Goals

- 长门禁/构建默认落盘、可后台等待、只回显尾部摘要。
- 异步 UI 测试区分“内容就绪”和“行为 effect 就绪”。
- 审查报告可创建骨架、可机械校验，主代理在门禁前确认物证存在。
- 本地签名包一条命令完成旧包备份、构建、验签和按提交 SHA 归档。
- Retro 可从脱敏会话导出直接生成结构化统计。
- 发布前预检统一检查版本、Git、签名配置、磁盘与旧产物，不输出秘密。

## Non-goals

- 不改应用业务行为，不改版本号，不发布 Release 或更新清单。
- 不引入新依赖。
- 不把 `check:all` 拆成多个真源；现有 `package.json` 聚合命令保持唯一入口。
- 不实现跨平台 GUI 或通用 CI 平台。

## Constraints

- Windows + Node.js + pnpm；脚本沿用 `adlo/scripts/*.mjs` 与 `node:test` 风格。
- 不打印签名私钥、密码或 token。
- 新脚本必须可在临时目录注入根路径/环境变量进行测试，不触碰真实仓库或签名配置。
- `.agents/` 为规则/技能真源，修改后同步 `.opencode/`、`.trae/` 镜像。
- 最终仍使用 `push:both -- main slot-1 slot-2`，不绕过 pre-push。

## Approaches

### A. 只补文档指针

成本最低，但长命令、报告物证、本地打包仍需人工拼接，问题会复发。否决。

### B. 单个 mega-script

文件少，但把日志、审查、发版、Retro 混在一个入口，测试与维护成本高。否决。

### C. 聚焦 CLI 模块 + 调用点指针（采用）

每个问题一个职责单一的脚本，纯函数与 IO 分离；文档只负责在正确场景指向命令。与现有 `review-snapshot.mjs`、`release.mjs`、`log-tail.mjs` 风格一致。

## Design

### 1. 长命令日志与等待

新增 `adlo/scripts/run-logged.mjs`：

- `start --name <name> -- <command>`：启动隐藏 worker，worker 将完整输出写入 `$TEMP/adl-logs/<name>.log`，退出码写入 `<name>.json`。
- `wait --name <name>`：等待 result 文件或 worker 结束，输出末尾 80 行并按原退出码返回。
- `status` / `tail`：只读查看状态或尾部。
- 包脚本增加 `check:all:log`、`release:build:log`、`wait:logged`。

`quality-gates.md` 与 `adlo-release` 技能直接指向这些命令，不再让调用点自行拼后台命令。

### 2. 异步测试就绪规则

更新 `mandatory-testing.md`：

- 内容就绪：`findByText` / `findByRole` 仅证明节点出现。
- 行为就绪：键盘监听、焦点陷阱、异步 action 必须等待可观察状态（焦点进入对话框、业务状态变化、按钮启用）。

`review-judgements.md` 增加审查项：标题/容器出现后立即派发键盘事件的用例，需要证明 listener/effect 已安装。

### 3. 审查报告物证

新增 `adlo/scripts/review-report.mjs`：

- `create <path>`：写入含精确 `- 需修复项：0` 结论行的骨架。
- `check <path>`：校验文件存在、必要章节、结论行、分级数字格式；非零退出表示不可进入门禁。

`review-brief.md` 与 `root-cause-to-close` 技能要求：子代理只写指定报告；主代理在 `check-review-gate` 前运行 `review:report check`。

### 4. 本地签名包自动化

新增 `adlo/scripts/release-local.mjs` 与纯函数模块 `adlo/scripts/release/local-package.mjs`：

- 读取当前版本与短 SHA。
- 将 bundle 内同版本 exe/sig 和 `.release/local/v<ver>` 移到 `.release/backups/<timestamp>/`。
- 调用现有 `release.mjs build --local`，保持构建/签名真源不变。
- 调用现有 `verify-local-signature.mjs`。
- 归档到 `ADLO_BUILD_ARCHIVE_ROOT`（默认 `E:/AI-DIGITAL-LIFE/Adlo-builds`）下 `v<ver>-pre-<sha>/`；先写唯一临时目录，再原子发布，并发调用只有一个胜者。
- 输出版本、SHA、安装包路径、校验和、验签结果、`published=false`。

包脚本增加 `release:build:local` 与 `release:local:verify`。

### 5. Retro 结构化摘要

新增 `adlo/scripts/retro-summary.mjs`：

- 输入 `opencode session export --sanitize` 的 JSON 文件。
- 输出消息/工具计数、工具耗时、token 峰值、错误工具、连续重复调用与时间段。
- 不读取或输出被脱敏的正文。

`retro` 技能增加该命令，并明确脱敏导出只保留结构，时间线仍需进度/报告/shell 证据。

### 6. 发布前预检

新增 `adlo/scripts/release-preflight.mjs` 与纯函数模块 `adlo/scripts/release/preflight.mjs`：

- 三处版本一致。
- 分支、HEAD、工作区、双远程 URL。
- 签名私钥路径/环境变量与密码是否存在（只报布尔值）。
- 磁盘余量。
- 同版本旧产物与归档目标冲突。
- 本地/发布模式提示。

包脚本增加 `release:preflight`；`adlo-release` 技能在构建前调用它。

## Verification

- 每个新 CLI 至少一组 `node:test`，覆盖参数、临时根目录、错误路径与秘密不输出。
- 文档修改跑 `check:docs-links`、`check:skills`、`check:context-budget`。
- 脚本修改跑 `check:script-lint`、`scripts:format:check`、`test:scripts`。
- 最终在 `slot-2` 跑 `check:repo`；合并 main 后按仓库规则跑 `check:all`（需用户批准）。
- 双远程推送使用 `push:both`，校验三分支 SHA 一致。
