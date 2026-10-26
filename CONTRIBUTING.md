# 贡献指南

欢迎贡献 AI 数字生命项目！本指南帮助您了解如何参与项目的开发、修复 Bug、改进文档或提出新功能。

---

## 代码规范

所有代码须遵循项目编码规范（分支命名、Commit 格式、TypeScript/Rust 风格），详见 [AGENTS.md](./AGENTS.md#编码规范)。

### 核心原则

- **禁止 `any` 类型**：TypeScript 中使用精确类型，善用 `unknown` 和 type guard
- **禁止 `unwrap()`**：Rust 中使用 `?` 运算符或模式匹配
- **禁止 `else`**：优先提前返回模式
- **测试先行**：修改后必须通过强制验收流程
- **重构小步提交**：单次变更聚焦一个职责
- **双端一致**：所有功能必须在 Tauri 桌面和浏览器模式下保持**功能行为一致**（实现策略可因环境而异，通过统一接口抽象隔离差异）

---

## 开发环境

### 前置要求

| 工具 | 最低版本 | 说明 |
|------|----------|------|
| Rust | 1.85+ | 通过 `rustup` 安装 |
| Node.js | 24.15+ | 通过 fnm/nvm 或官方安装包安装 |
| pnpm | 11.x+ | `npm i -g pnpm` |
| Tauri CLI | 2.x | `npm i -g @tauri-apps/cli` 或 `cargo install tauri-cli --version "^2"` |

### 本地开发

```powershell
# 1. 安装依赖（在 pnpm 工作区根目录）
cd ai-digital-life
pnpm install

# 2. 启动开发服务器（浏览器模式，推荐）
pnpm run dev:browser

# 3. 或同时启动双端（Tauri + 浏览器）
pnpm run dev:both
```

### 提交前门禁（本地执行）

本项目**不使用远程 CI**：lint / 类型检查 / 格式 / i18n / 术语表 / 生成物一致性 / 测试全部在本地完成。装一次 pre-push 钩子即可获得推送前拦截：

```powershell
git config core.hooksPath .githooks
```

默认只跑**受影响范围**（`check:changed`）：变更文件 lint/format + 类型与契约不变量 + `vitest related` 受影响用例；没有 `src/` 变更时不跑测试。

全量门禁（`check:full`，约 5 分钟）**需要人工批准**，仅在发布打包前或明确需要时执行：

```powershell
$env:ADL_PREPUSH_FULL = '1'   # 经批准后的全量推送门禁
git push
```

日常手动验证建议：`pnpm --dir ai-digital-life/frontend run check:changed`；需要跑某组测试用 `vitest run <目录/文件>`。

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
├── FUTURE-ROADMAP.md    # 远期规划
├── ai-digital-life/     # 实现工作区（Rust + Tauri + React）
├── references/          # 外部参考源码（本地拉取的开源项目）
└── docs/                # 架构、设计、知识库
```

---

## 如何贡献

### 报告 Bug

1. 使用 **Bug 报告模板** 创建 Issue
2. 提供：运行环境、复现步骤、期望行为、实际行为
3. 附上调试日志（使用应用右上角"复制调试日志"按钮）
4. **禁止**提交 AI 自动生成的 Bug 报告

### 提出新功能

1. 使用 **功能请求模板** 创建 Issue
2. 描述：要解决的问题、预期方案、为什么适合本项目
3. 核心功能需要先经过设计讨论

### 提交 Pull Request

1. **关联 Issue**：在 PR 描述中使用 `Fixes #123` 或 `Closes #123`
2. **完整填写 PR 模板**：包括 What、Type、Verification、Checklist
3. **UI 变更**必须附带 Before/After 截图或录屏
4. **逻辑变更**必须说明验证方式（测试了什么、如何复现）
5. **禁止 AI 生成的文字墙**：用简洁、自己的语言描述
6. **通过强制验收流程**（详见 [mandatory-testing.md](./.agents/rules/mandatory-testing.md)）

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

发现安全漏洞，请**不要**公开提交 Issue，而是通过电子邮件或内部渠道私下报告。详见 [SECURITY.md](./SECURITY.md)。

---

## 行为准则

- 尊重所有贡献者，保持专业和友善
- 关注代码本身而非个人
- 建设性反馈优于批评
- 禁止提交 AI 自动生成的低质量贡献

---

## 相关文档

- [AGENTS.md](./AGENTS.md) — 项目治理规则、编码规范
- [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md) — 并行分支开发技能（唯一真源；工作树隔离与复用）
- [GLOSSARY.md](./GLOSSARY.md) — 领域术语表
- [CONTEXT.md](./CONTEXT.md) — 架构与实现说明
- [SECURITY.md](./SECURITY.md) — 安全策略
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 远期规划
- [docs/](./docs/) — 架构设计、知识库、设计系统
