# MCP模型上下文协议

## 功能描述

MCP(Model Context Protocol)是Anthropic主导的开放协议，用于标准化AI模型与外部工具、数据源的交互方式，被誉为AI领域的"USB-C接口"。通过MCP，AI编程工具可以统一接入各种外部服务和数据源，实现能力的无限扩展。

## 核心特性

### 协议架构

```
MCP架构：
┌─────────────────┐
│   MCP Client    │  ← AI编程工具
│  (AI Tool端)    │
└────────┬────────┘
         │ MCP协议
         ▼
┌─────────────────┐
│   MCP Server    │  ← 数据/工具提供者
│  (服务端)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  外部资源/服务   │
└─────────────────┘
```

#### 传输方式

| 方式 | 描述 | 适用场景 |
|------|------|---------|
| stdio | 标准输入输出 | 本地进程通信 |
| SSE | Server-Sent Events | 实时推送 |
| Streamable HTTP | 可流式HTTP | 远程服务 |

### 支持资源

#### 文件系统

- **本地文件**：读写本地文件
- **远程文件**：访问远程文件系统
- **目录浏览**：浏览目录结构
- **文件监控**：监控文件变化

#### 数据库

- **SQL数据库**：MySQL、PostgreSQL等
- **NoSQL数据库**：MongoDB、Redis等
- **向量数据库**：Pinecone、Chroma等
- **数据查询**：执行查询语句

#### Git仓库

- **仓库操作**：clone、pull、push
- **分支管理**：创建、切换、合并分支
- **提交管理**：提交、回滚、cherry-pick
- **历史查询**：查看提交历史

#### API服务

- **REST API**：调用REST接口
- **GraphQL**：执行GraphQL查询
- **Webhook**：接收Webhook事件
- **认证集成**：OAuth、API Key等

#### 浏览器

- **网页抓取**：抓取网页内容
- **页面交互**：模拟用户操作
- **截图**：页面截图
- **表单填充**：自动填充表单

#### 向量库

- **文档索引**：索引文档到向量库
- **语义搜索**：语义相似度搜索
- **嵌入生成**：生成文本嵌入
- **知识检索**：检索相关知识

### 能力类型

#### Tools（工具）

可执行的操作，AI可以调用这些工具完成特定任务。

```json
{
  "name": "query_database",
  "description": "执行SQL查询",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sql": {"type": "string"}
    }
  }
}
```

#### Prompts（提示词）

预定义的提示词模板，可以快速注入常用指令。

```json
{
  "name": "code_review",
  "description": "代码审查提示词",
  "template": "请审查以下代码：\n{code}"
}
```

#### Resources（资源）

可访问的数据资源，AI可以读取这些数据。

```json
{
  "uri": "file:///path/to/file",
  "name": "配置文件",
  "mimeType": "application/json"
}
```

#### Roots（根目录）

工作区根目录，定义AI的工作范围。

```json
{
  "uri": "file:///project/root",
  "name": "项目根目录"
}
```

#### Elicitation（交互式UI）

交互式用户界面，支持用户输入和选择。

```json
{
  "type": "form",
  "fields": [
    {"name": "projectName", "type": "text"},
    {"name": "framework", "type": "select", "options": ["React", "Vue"]}
  ]
}
```

### 安全机制

#### 权限隔离

- **工具权限**：控制可调用的工具
- **资源权限**：控制可访问的资源
- **操作权限**：控制可执行的操作

#### 会话级上下文注入

- **临时注入**：仅在当前会话有效
- **隔离注入**：不同会话间隔离
- **自动清理**：会话结束后清理

#### 防止Prompt注入

- **输入验证**：验证用户输入
- **输出过滤**：过滤敏感信息
- **沙箱执行**：隔离执行环境

#### 跨工具兼容

- **协议统一**：统一的协议规范
- **版本兼容**：向后兼容
- **错误处理**：统一的错误处理

## 应用场景

### 从Jira/Linear读取需求

通过MCP连接项目管理工具，自动读取需求信息，生成对应的代码实现。

### 从Sentry读取监控数据

连接监控平台，分析错误日志，生成修复方案。

### 在GitHub创建PR

连接GitHub API，自动创建Pull Request，添加描述和审查者。

### 查询数据库生成报表

连接数据库，执行查询，生成数据报表和分析报告。

### 集成企业内部工具

通过自定义MCP Server，集成企业内部工具和服务。

## 技术要点

### MCP Server开发

```typescript
// MCP Server示例
import { Server } from '@modelcontextprotocol/sdk';

const server = new Server({
  name: 'my-mcp-server',
  version: '1.0.0'
});

// 注册工具
server.tool('my_tool', {
  description: '工具描述',
  inputSchema: { ... },
  handler: async (input) => {
    // 处理逻辑
    return { result: '...' };
  }
});

// 启动服务
server.start();
```

### MCP Client集成

```typescript
// MCP Client示例
import { Client } from '@modelcontextprotocol/sdk';

const client = new Client();
await client.connect('stdio', { command: 'my-mcp-server' });

// 调用工具
const result = await client.callTool('my_tool', { ... });
```

### 错误处理

- **连接错误**：处理连接失败
- **超时处理**：处理请求超时
- **错误重试**：自动重试机制
- **降级策略**：服务不可用时的降级

### 性能优化

- **连接池**：复用连接
- **缓存**：缓存常用数据
- **批量请求**：批量处理请求
- **异步处理**：异步非阻塞

## 工具实现参考

| 工具 | MCP支持 | 服务器数量 | 传输方式 | 特色功能 |
|------|---------|-----------|---------|---------|
| Claude Code | ✅ 原生支持 | 300+ | stdio/SSE/HTTP | Server & Client模式 |
| Cursor | ✅ 一级支持 | 1800+ | stdio/SSE | MCP Resources支持 |
| Trae | ✅ 完整支持 | 200+ | stdio/SSE/HTTP | 火山引擎MCP Market |
| Codex CLI | 🟡 有限支持 | 少量 | 配置文件 | MCP and Connectors |
| Windsurf | ✅ 支持 | 中等 | stdio/SSE | 工具集成 |
| Roo Code | ✅ 集成 | 可扩展 | 多种 | 外部工具集成 |

## 最佳实践

1. **最小权限原则**：只申请必要的权限
2. **错误处理完善**：处理各种错误情况
3. **文档清晰**：提供清晰的使用文档
4. **版本管理**：使用语义化版本号
5. **测试覆盖**：编写完整的测试用例
