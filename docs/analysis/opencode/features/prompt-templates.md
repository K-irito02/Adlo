# System Prompt 模板系统

> 源码：`opencode/src/session/prompt/`（13 个模板）、`opencode/src/agent/prompt/`（4 个模板）

## 模板体系

OpenCode 的 System Prompt 按两层模板组织：

### 第一层：Agent Prompt（agent/prompt/）

| 文件 | 用途 | 触发场景 |
|------|------|----------|
| `compaction.txt` | 会话压缩指令 | 自动 compaction 时使用 |
| `explore.txt` | 代码探索指令 | explore agent 启动 |
| `summary.txt` | 摘要生成指令 | 自动摘要时使用 |
| `title.txt` | 标题生成指令 | 自动标题时使用 |

### 第二层：Provider Prompt（session/prompt/）

| 文件 | 目标 Provider | 说明 |
|------|--------------|------|
| `anthropic.txt` | Anthropic (Claude) | Claude 系列专用 prompt |
| `gpt.txt` | OpenAI (GPT) | GPT 系列专用 prompt |
| `gemini.txt` | Google (Gemini) | Gemini 系列专用 prompt |
| `kimi.txt` | Moonshot (Kimi) | Kimi 专用 prompt |
| `codex.txt` | OpenAI (Codex) | Codex 代码专用 |
| `copilot-gpt-5.txt` | GitHub Copilot | Copilot GPT-5 prompt |
| `beast.txt` | Beast Mode | 激进模式 prompt |
| `trinity.txt` | Trinity | 三位一体模式 prompt |
| `default.txt` | 通用默认 | 未匹配到 Provider 时的 fallback |
| `plan.txt` | Plan Mode | 规划模式 prompt |
| `plan-mode.txt` | Plan Mode 切换 | 进入/退出 plan 的指令 |
| `plan-reminder-anthropic.txt` | Anthropic Plan | Claude 的 plan 提醒 |
| `build-switch.txt` | Build Mode | 切换到 build agent 的指令 |

## Prompt 构建流程

```
Session.prompt(sessionID)
  │
  ▼
根据 Session.agent → 选择 Agent Prompt
  │
  ▼
根据 Session.model → 选择 Provider Prompt
  │
  ▼
合并 → 注入 System Context → 注入 Plan/Compaction 状态 → 注入 Skill 指令
  │
  ▼
最终 System Prompt
```

## Prompt 变量注入

模板中可使用的变量：

| 变量 | 来源 | 说明 |
|------|------|------|
| `{shell}` | Config | 当前 shell 类型（bash/zsh/fish/powershell） |
| `{workspace}` | Session | 工作区路径 |
| `{model}` | Session | 当前模型名称 |
| `{agent}` | Session | 当前 Agent 名称 |
| `{date}` | System | 当前日期 |
| `{system_context}` | Context Sources | 系统上下文 |
| `{todo}` | Session | 当前 Todo 列表 |
| `{compaction_summary}` | Session | Compaction 摘要 |
| `{plan}` | Session | 当前 Plan 内容 |
| `{skills}` | Skill Service | 可用技能列表 |

## 关键设计要点

1. **Provider 感知**：不同模型有不同的指令格式偏好，模板按 Provider 定制
2. **Agent 感知**：不同 Agent（build/plan/explore）有不同的角色定义
3. **模式感知**：Plan Mode 和 Build Mode 有独立的 prompt 分支
4. **Compaction 注入**：历史摘要通过模板变量注入 system prompt
5. **Skill 注入**：可用技能列表在会话开始时一次性注入
