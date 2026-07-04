# 贡献指南

欢迎贡献 AI 数字生命项目！本指南帮助您了解如何参与项目的开发、修复 Bug、改进文档或提出新功能。

---

## 代码规范

所有代码须遵循项目编码规范，详见 [AGENTS.md](./AGENTS.md#编码规范)。

### 核心原则
- **禁止 `any` 类型**：TypeScript 中使用精确类型
- **禁止 `unwrap()`**：Rust 中使用 `?` 运算符
- **禁止 `else`**：优先提前返回
- **测试先行**：修改后必须通过强制验收流程
- **重构小步提交**：单次变更聚焦一个职责

### 分支命名
- 格式：kebab-case，最多 3 个单词
- 禁止斜杠、禁止类型前缀
- 示例：`session-recovery`、`fix-scroll-state`

### Commit 信息
- 格式：`type(scope): summary`
- 类型：`feat` / `fix` / `docs` / `chore` / `refactor` / `test`
- Scope：`core` / `frontend` / `rust` / `stores` / `browser` / `terminal` / `ipc` / `docs` / `deps`

---

## 开发环境

### 前置要求

| 工具 | 最低版本 | 说明 |
|------|----------|------|
| Rust | 1.85+ | 通过 `rustup` 安装 |
| Node.js | 24.15+ | 安装路径 `D:\Program Files\nodejs` |
| pnpm | 10.x+ | `npm i -g pnpm` |
| Tauri CLI | 2.x | `cargo install tauri-cli` |
| Clash 代理 | - | 依赖代理 (127.0.0.1:7890) |

### 本地开发

```bash
# 1. 设置 Node.js 环境（每次新终端执行）
$env:Path = "D:\Program Files\nodejs;$env:Path"

# 2. 安装前端依赖
cd ai-digital-life/frontend
pnpm install

# 3. 启动开发服务器（浏览器模式，推荐）
pnpm run dev:browser

# 4. 或同时启动双端（Tauri + 浏览器）
pnpm run dev:both
```

### 目录结构

```
├── AGENTS.md            # 项目治理规则
├── CONTEXT.md           # 领域术语表
├── ai-digital-life/     # 实现工作区
│   ├── src-tauri/       # Tauri 二进制与命令
│   ├── crates/          # Rust 库 crate
│   ├── frontend/        # React + Vite 前端
│   └── Cargo.toml       # Rust 工作区根
├── docs/                # 架构、设计、知识沉淀
├── .trae/rules/         # AI 代理开发规则
└── .opencode/skills/    # AI 代理技能
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
6. **通过强制验收流程**（详见 [mandatory-testing.md](./.trae/rules/mandatory-testing.md)）

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
