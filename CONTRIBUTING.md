# 贡献指南

欢迎参与 Adlo 的开发！报告问题、改进文档、修复 Bug 或提出新功能，都可以从本文件开始。

> 动手前请先读 [AGENTS.md](./AGENTS.md)（治理规则与编码规范）。本文件只保留贡献者的最短路径。

---

## 代码规范

所有代码遵循项目编码规范（分支命名、Commit 格式、TypeScript / Rust 风格），详见 [AGENTS.md](./AGENTS.md#编码规范)。

### 核心原则

- **禁止 `any` 类型**：使用精确类型，善用 `unknown` 与 type guard
- **禁止 `unwrap()`**：Rust 用 `?` 运算符或模式匹配
- **禁止 `else`**：优先提前返回
- **测试先行**：变更后必须通过结束验收流程
- **小步提交**：一次变更只做一件事
- **双端一致**：Tauri 桌面与浏览器模式保持功能行为一致（实现策略可不同，通过统一接口隔离差异）

---

## 开发环境

### 前置要求

| 工具      | 最低版本 | 说明                                                    |
| --------- | -------- | ------------------------------------------------------- |
| Rust      | 1.85+    | 通过 `rustup` 安装                                      |
| Node.js   | 24.15+   | 通过 fnm / nvm 或官方安装包安装                         |
| pnpm      | 11.x+    | `npm i -g pnpm`                                         |
| Tauri CLI | 2.x      | `npm i -g @tauri-apps/cli` 或 `cargo install tauri-cli --version "^2"` |

Windows 还需 MSVC C++ 生成工具与 WebView2 运行时。镜像配置、`stage:sidecar` 前置等工具链细节见 [adlo/CONTRIBUTING.md](./adlo/CONTRIBUTING.md)。

### 本地开发

```powershell
# 1. 安装依赖：仓库根装 Git 钩子，adlo 工作区装应用依赖
pnpm install

cd adlo
pnpm install

# 2. 浏览器模式（推荐，迭代最快）
pnpm run dev:browser

# 3. 或并行启动双端（Tauri + 浏览器）
pnpm run dev:both
```

> `pnpm run dev:tauri` 在 `adlo/frontend/dist/` 缺失时会自动写入占位页：Tauri 的 `generate_context!` 在编译期要求该目录存在（dev 实际走 `devUrl`）。`tauri build` 会由 `beforeBuildCommand` 重新构建并覆盖，无需手工处理。

### 提交前门禁（本地执行）

本项目**不使用远程 CI**：lint、类型检查、格式、i18n、术语表、生成物一致性与测试全部在本地完成。在仓库根安装一次即可获得钩子：

```powershell
pnpm install    # 根目录；prepare 安装 Husky 并设置 core.hooksPath=.husky
```

| 钩子               | 内容                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `.husky/pre-commit` | staged ESLint、lint-staged + Prettier、仓库不变量（秒级）              |
| `.husky/pre-push`   | `check:repo`、Rust 受影响范围、受影响前端测试                          |

### 日常校验

| 场景           | 命令                                                            |
| -------------- | --------------------------------------------------------------- |
| 受影响范围     | `pnpm --dir adlo/frontend run check:changed`                    |
| 只查静态项     | `pnpm --dir adlo/frontend run check:changed -- --skip-tests`    |
| 定向前端测试   | `pnpm --dir adlo/frontend run test:one -- <文件或目录>`         |
| 定向 Rust 测试 | `cargo test -p <crate> [过滤词]`                                |

在 `adlo/` 内执行时可省略 `--dir adlo`。全量门禁（`check:full`、`check:all`、`cargo test --workspace`、`cargo tauri build`）执行前**必须先获得维护者批准**，仅在发布打包前或明确需要时运行：

```powershell
$env:ADL_PREPUSH_FULL = '1'   # 经批准后的全量推送门禁
git push
```

### 多会话并行开发

多个会话 / 多 agent 同时开发时，按 **一分支 = 一工作树 = 一会话** 隔离，不要共用同一目录：

```bash
git worktree add "E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/<branch>" -b <branch> main
```

开工自检、复用旧槽位（免冷构建）、合并后保留等完整流程见技能 [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md)（唯一真源）。

### 目录结构

```
├── AGENTS.md            # 项目治理规则、编码规范
├── GLOSSARY.md          # 领域术语表
├── CONTEXT.md           # 架构与实现说明
├── SECURITY.md          # 安全策略
├── FUTURE-ROADMAP.md    # 未来工作
├── package.json         # 仓库根工具链（Husky / lint-staged / Prettier）
├── .husky/              # Git 钩子（pre-commit / pre-push）
├── .agents/             # 规则与技能真源（同步到 .opencode / .trae）
├── adlo/                # 实现工作区（Rust + Tauri + React）
├── docs/                # 架构、设计、知识库
└── references/          # 外部参考源码（需本地拉取，默认不入库）
```

---

## 如何贡献

### 报告 Bug

1. 在 [Issues](https://github.com/K-irito02/Adlo/issues) 新建 Issue，标题写清现象
2. 提供：运行环境与版本、复现步骤、期望行为、实际行为
3. 附上调试日志：debug 构建写入仓库根 `.adl-logs/`；控制台可执行 `__exportDebugLogs()` 导出
4. **请勿直接提交 AI 自动生成的报告**：请用自己的语言描述，避免长文掩盖关键信息

### 提出新功能

1. 先开 Issue 描述：要解决的问题、预期方案、为什么适合本项目
2. 核心功能先经过设计讨论，再动手实现

### 提交 Pull Request

1. **关联 Issue**：在描述中使用 `Fixes #123` 或 `Closes #123`
2. **写清 PR 描述**：What（改了什么）、Why（为什么改）、Verification（如何验证）、Checklist
3. **UI 变更**必须附 Before / After 截图或录屏
4. **逻辑变更**必须说明验证方式（测了什么、如何复现）
5. **不用 AI 生成的文字墙**：简洁、用自己的语言
6. 通过强制验收流程（详见 [mandatory-testing.md](./.agents/rules/mandatory-testing.md)）

### PR 审查要点

审查者将从以下维度评估 PR：

- [ ] 编码规范：遵循 `AGENTS.md` 中的风格指南
- [ ] 类型安全：无 `any`、无 `unwrap()`
- [ ] 测试覆盖：新代码有对应测试
- [ ] 双端一致：Tauri 和浏览器模式均正常工作
- [ ] i18n 覆盖：所有 UI 文本使用 i18n key
- [ ] 无破坏性变更：修改不破坏现有功能
- [ ] 影响评估：评估变更涉及模块与依赖

---

## 安全报告

发现安全漏洞，请**不要**公开提交 Issue，而是通过邮件或内部渠道私下报告。详见 [SECURITY.md](./SECURITY.md)。

---

## 行为准则

- 尊重所有贡献者，保持专业和友善
- 关注代码本身而非个人
- 建设性反馈优于批评
- 提交前自查：内容真实、可复现、可验证

---

## 相关文档

- [AGENTS.md](./AGENTS.md) — 项目治理规则、编码规范
- [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md) — 并行分支开发技能（唯一真源；工作树隔离与复用）
- [GLOSSARY.md](./GLOSSARY.md) — 领域术语表
- [CONTEXT.md](./CONTEXT.md) — 架构与实现说明
- [SECURITY.md](./SECURITY.md) — 安全策略
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 未来工作
- [LICENSE](./LICENSE) — MIT 许可证
- [docs/](./docs/) — 架构设计、知识库、设计系统
