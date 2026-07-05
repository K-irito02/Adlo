# 未来路线图

本文档记录 AI 数字生命项目的远期规划与待实现功能。当前阶段聚焦单 Agent 系统与基础设施，远期功能按优先级分层。

---

## Phase 2 已完成功能

以下为 Phase 2（5 个子阶段 2-A 至 2-E）已完成的 18 项缺失能力：

| 功能 | 说明 | 子阶段 |
|------|------|--------|
| 多 Agent 系统 | Agent 注册表 + 路由（build/plan/general/explore/compaction/title/summary）| 2-A |
| Sub-agent / Task 工具 | Sub-agent 生命周期管理 + 后台执行 + 恢复 | 2-A |
| Plan Mode | 只读计划模式 + plan_enter/plan_exit + 工具门控 | 2-A |
| MCP 完整集成 | Stdio/SSE/StreamableHTTP 传输 + OAuth + 工具适配 | 2-B |
| 多 LLM Provider | OpenAI/Anthropic/Google/Ollama/OpenRouter 适配器 | 2-B |
| Provider-specific Prompts | 按 Provider 定制的系统提示模板 | 2-B |
| Compaction | Token-aware 会话压缩（PRUNE_MINIMUM=20000）| 2-C |
| Snapshot / Revert | Message-level git 快照 + 回滚 | 2-C |
| WebFetch / WebSearch | 网络获取 + Tavily 搜索工具 | 2-C |
| 自定义命令 | 可配置斜杠命令（$1/$ARGUMENTS/$WORKSPACE 模板）| 2-D |
| 权限 Ruleset | Allow/Ask/Deny 三态 + 通配匹配 + doom_loop 检测 | 2-D |
| Session Fork | 会话分支（父/子关系）| 2-E |
| LSP 集成 | rust-analyzer/ts-server/pylsp/gopls 支持 | 2-E |
| Plugin 系统 | Plugin trait + 7 种 Hook + 启禁用管理 | 2-E |
| Reference 系统 | 外部目录引用 + 上下文注入 | 2-E |
| 自定义 Agent 配置 | 用户自定义 Agent 注册 | 2-E |
| Hot Reload Config | notify 文件监听 + watch channel 热加载 | 2-E |
| Durable Session | 心跳检测 + 崩溃恢复 + 重试 | 2-E |

## Phase 3+ 待实现功能

### L3 生态与规模化

| 功能 | 说明 | 前置依赖 |
|------|------|----------|
| ACP (Agent Client Protocol) | 接口已预留，待实现 | Phase 2 核心能力 |
| HTTP API 服务器 | 接口已预留，待实现 | Phase 2 核心能力 |
| CodeMode 沙箱 | 接口已预留，实验性 | 安全沙箱 |
| 插件市场 | 第三方插件加载（wasm/dylib）| Plugin 系统成熟 |
| 浏览器自动化运行时 | Web 自动化操作 | 安全沙箱 |
| 云服务集成 | 云端能力对接 | 核心能力稳定 |
| 多模态输入支持 | 图像、语音等输入 | 核心能力稳定 |
| CI/CD 集成 | 流水线自动化 | 核心能力稳定 |

### 团队协作

| 功能 | 说明 | 前置依赖 |
|------|------|----------|
| 实时协作编辑 | 多人同时编辑 | Phase 3 基础 |
| 团队知识管理 | 共享知识库 | Phase 3 基础 |
| 代码审查协作 | PR 审查流程 | Phase 3 基础 |

### 安全治理扩展

| 功能 | 说明 | 前置依赖 |
|------|------|----------|
| 高级权限管理 | 细粒度 RBAC | Phase 3 基础 |
| 合规审计 | 审计日志与报告 | Phase 3 基础 |
| 安全扫描集成 | 漏洞检测 | Phase 3 基础 |

### 质量保障扩展

| 功能 | 说明 | 前置依赖 |
|------|------|----------|
| 高级测试自动化 | AI 生成测试 | Phase 3 基础 |
| 文档自动化 | 文档生成 | Phase 3 基础 |
| 依赖安全管理 | 漏洞检测 | Phase 3 基础 |

---

## 技术债务与架构演进

### 未来架构演进

| 项目 | 说明 | 触发条件 |
|------|------|----------|
| 多存储后端 | SQLite → 可插拔存储 | 数据量增长 |
| 分布式 Agent | 单机 → 分布式 | 多项目并行 |
| 云端同步 | 本地 → 云端同步 | 用户需求 |

### 性能优化路线

| 阶段 | 目标 |
|------|------|
| 近中期 | 向量检索优化、增量索引 |
| 远期 | 分布式计算、模型缓存层 |

---

## 功能开关策略

以下功能将在 Phase 2+ 分阶段启用：

```typescript
// Feature flags — Phase 2 all features completed
const FEATURE_FLAGS = {
  multiAgent: true,         // Phase 2-A — completed
  subagent: true,           // Phase 2-A — completed
  planMode: true,           // Phase 2-A — completed
  mcp: true,                // Phase 2-B — completed
  multiProvider: true,      // Phase 2-B — completed
  compaction: true,         // Phase 2-C — completed
  snapshotRevert: true,     // Phase 2-C — completed
  webFetch: true,           // Phase 2-C — completed
  customCommands: true,     // Phase 2-D — completed
  permissionRuleset: true,  // Phase 2-D — completed
  sessionFork: true,        // Phase 2-E — completed
  lsp: true,                // Phase 2-E — completed
  pluginSystem: true,       // Phase 2-E — completed
  referenceSystem: true,    // Phase 2-E — completed
  customAgent: true,        // Phase 2-E — completed
  hotReload: true,          // Phase 2-E — completed
  durableSession: true,     // Phase 2-E — completed
  acp: false,               // Phase 3+ — interface only
  httpApi: false,           // Phase 3+ — interface only
  codeMode: false,          // Phase 3+ — interface only
  sandbox: false,           // Phase 3+
  cloudSync: false,         // Phase 3
  browserAutomation: false, // Phase 3+
  plugins: false,           // Phase 3+ (marketplace)
  collaboration: false,     // Phase 3+
  multimodal: false,        // Phase 3+
}
```

---

## 决策记录

### 已纳入并完成 Phase 2 的功能

| 功能 | 说明 |
|------|------|
| 多 Agent DAG | Phase 2-A 已完成 — Agent 注册表 + 路由 + Sub-agent 系统 |
| MCP 协议 | Phase 2-B 已完成 — 三种传输 + OAuth + 工具适配 |
| 插件系统 | Phase 2-E 已完成 — Plugin trait + 7 种 Hook + 注册表 |
| Session Fork | Phase 2-E 已完成 — 会话分支与父子关系 |
| LSP 集成 | Phase 2-E 已完成 — 4 种语言服务器 + 诊断 + 符号 |
| Reference 系统 | Phase 2-E 已完成 — 外部目录引用 + 上下文注入 |

### 当前阶段排除项

| 功能 | 原因 |
|------|------|
| 插件市场（第三方加载） | Phase 3+ 能力，需要 Plugin 系统成熟 & 安全边界完善 |
| 浏览器自动化 | Phase 3+ 能力，需要安全沙箱基础 |
| 复杂云协作 | Phase 3+ 能力，超出当前架构 |
| ACP / HTTP API / CodeMode | 接口已预留，实装待 Phase 3+ |

---

## 随项目演进

- 新增待实现功能：在对应层级添加
- 功能移入已实现：从本文档移除，更新 AGENTS.md
- 优先级调整：更新功能说明与前置依赖

## 相关文件

- [AGENTS.md](./AGENTS.md)
- [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md)
- [phase-boundary.md](./.agents/rules/phase-boundary.md)
