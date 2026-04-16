# Hooks钩子机制

## 功能描述

Hooks钩子机制是在特定生命周期事件中注入自定义行为的能力，实现事件驱动的自动化工作流。通过Hooks，开发者可以在关键节点插入自定义逻辑，实现代码检查、自动格式化、通知发送等自动化操作。

## 核心特性

### 触发事件类型

#### Setup（仓库初始化）

- **触发时机**：首次打开项目或克隆仓库
- **典型用途**：
  - 安装依赖
  - 配置环境变量
  - 初始化数据库
  - 下载必要资源

#### SessionStart（会话开始）

- **触发时机**：AI会话开始时
- **典型用途**：
  - 加载项目上下文
  - 恢复上次状态
  - 检查环境状态
  - 初始化工具

#### PreToolUse（工具执行前）

- **触发时机**：AI调用工具前
- **典型用途**：
  - 参数验证
  - 权限检查
  - 日志记录
  - 状态保存

#### PostToolUse（工具执行后）

- **触发时机**：AI调用工具后
- **典型用途**：
  - 结果验证
  - 自动格式化
  - 通知发送
  - 状态更新

#### ConfigChange（配置变更）

- **触发时机**：配置文件变更时
- **典型用途**：
  - 重载配置
  - 验证配置
  - 通知变更
  - 备份配置

#### TeammateIdle（子智能体等待）

- **触发时机**：子智能体等待输入时
- **典型用途**：
  - 任务分配
  - 状态同步
  - 资源协调
  - 超时处理

#### TaskCompleted（任务完成）

- **触发时机**：任务完成时
- **典型用途**：
  - 生成报告
  - 发送通知
  - 清理资源
  - 更新状态

#### Stop（会话结束）

- **触发时机**：AI会话结束时
- **典型用途**：
  - 保存状态
  - 清理资源
  - 生成总结
  - 归档日志

### 典型用途

#### 自动格式化代码

```json
{
  "event": "PostToolUse",
  "condition": "tool == 'Write'",
  "action": "npx prettier --write ${file}",
  "description": "写入文件后自动格式化"
}
```

#### 生成Commit Message

```json
{
  "event": "PreToolUse",
  "condition": "tool == 'git_commit'",
  "action": "generate_commit_message",
  "description": "提交前自动生成提交信息"
}
```

#### 修复Lint错误

```json
{
  "event": "PostToolUse",
  "condition": "tool == 'Write' && file.endsWith('.ts')",
  "action": "npx eslint --fix ${file}",
  "description": "写入TS文件后自动修复Lint错误"
}
```

#### 触发CI/CD

```json
{
  "event": "TaskCompleted",
  "condition": "task.type == 'deployment'",
  "action": "trigger_ci_pipeline",
  "description": "部署任务完成后触发CI/CD"
}
```

#### 记录AI决策日志

```json
{
  "event": "PostToolUse",
  "condition": "true",
  "action": "log_decision",
  "description": "记录所有AI决策"
}
```

#### 安全审计

```json
{
  "event": "PreToolUse",
  "condition": "tool in ['Bash', 'Write']",
  "action": "security_audit",
  "description": "敏感操作前进行安全审计"
}
```

#### 权限验证

```json
{
  "event": "PreToolUse",
  "condition": "tool == 'Bash' && command.includes('sudo')",
  "action": "require_approval",
  "description": "sudo命令需要审批"
}
```

### 执行方式

#### 外部命令（Shell脚本）

```json
{
  "event": "PostToolUse",
  "action": {
    "type": "shell",
    "command": "./scripts/format.sh ${file}"
  }
}
```

#### 内置函数

```json
{
  "event": "PreToolUse",
  "action": {
    "type": "builtin",
    "function": "validate_parameters"
  }
}
```

#### API调用

```json
{
  "event": "TaskCompleted",
  "action": {
    "type": "api",
    "url": "https://api.example.com/notify",
    "method": "POST",
    "body": {"task": "${task.id}"}
  }
}
```

### 控制机制

#### 退出码控制

| 退出码 | 含义 | 行为 |
|--------|------|------|
| 0 | 成功 | 继续执行 |
| 1 | 警告 | 记录警告，继续执行 |
| 2 | 阻止 | 阻止操作，返回错误 |

#### 超时设置

```json
{
  "event": "PostToolUse",
  "action": "...",
  "timeout": 30000,
  "onTimeout": "skip"
}
```

#### 错误处理

```json
{
  "event": "PostToolUse",
  "action": "...",
  "onError": {
    "retry": 3,
    "fallback": "log_error"
  }
}
```

## 应用场景

### 代码提交前自动检查

在代码提交前自动运行Lint检查、测试套件，确保代码质量。

### 文件保存后自动格式化

文件保存后自动运行格式化工具，统一代码风格。

### 测试失败后自动修复

测试失败后自动分析失败原因，生成修复方案。

### 部署前安全扫描

部署前自动运行安全扫描，检测潜在漏洞。

### AI操作审计日志

记录所有AI操作，便于审计和问题追溯。

## 技术要点

### Hook配置格式

```json
{
  "hooks": [
    {
      "id": "auto-format",
      "event": "PostToolUse",
      "condition": "tool == 'Write'",
      "action": {
        "type": "shell",
        "command": "npx prettier --write ${file}"
      },
      "timeout": 10000,
      "enabled": true
    }
  ]
}
```

### 事件匹配

- **精确匹配**：event == 'PostToolUse'
- **条件组合**：event == 'PostToolUse' && tool == 'Write'
- **正则匹配**：file matches '.*\\.ts$'
- **自定义函数**：custom_condition()

### 执行顺序

```
Hook执行顺序：
1. 按优先级排序
2. 同优先级按注册顺序
3. Pre hooks先执行
4. Post hooks后执行
```

### 性能优化

- **异步执行**：非关键Hook异步执行
- **缓存结果**：缓存Hook执行结果
- **批量处理**：批量处理多个事件
- **条件跳过**：条件不满足时跳过

## 工具实现参考

| 工具 | Hooks支持 | 事件类型 | 执行方式 | 特色功能 |
|------|----------|---------|---------|---------|
| Claude Code | ✅ 完整支持 | 7种类型 | 外部命令 | JSON配置,退出码控制 |
| Cursor | ✅ 插件原语 | 多种事件 | 脚本/API | PreToolUse/PostToolUse |
| Codex CLI | ✅ 支持 | 基础事件 | 配置文件 | 与Skills集成 |
| Trae | 🟡 有限 | 计划中 | 规则+脚本 | 通过规则模拟 |
| Windsurf | 🟡 基础 | 少量事件 | 内置 | Cascade集成 |

## 最佳实践

1. **最小化Hook**：只注册必要的Hook
2. **异步优先**：非关键操作使用异步执行
3. **错误处理**：完善的错误处理机制
4. **日志记录**：记录Hook执行日志
5. **性能监控**：监控Hook执行性能
