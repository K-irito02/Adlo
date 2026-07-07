# Tool 系统

> 源码：`core/src/tool/`、`opencode/src/tool/`

## 工具系统架构

```
Tool.Definition<Input, Output>     ← 抽象定义
  │
  ├── Tool.make(config)             ← 工厂函数
  │   ├── description: string
  │   ├── input: Schema.Codec<Input>
  │   ├── output: Schema.Codec<Output>
  │   ├── execute(ctx, input): Effect<Output>
  │   └── toModelOutput(output): string
  │
  ├── Tool.withPermission(tool)     ← 权限包装
  │
  └── ToolRegistry.register(tools)  ← 注册到运行时
```

### Tool.Context

```ts
interface Context {
  sessionID: string
  agent: Agent.Info
  assistantMessageID: string
  toolCallID: string
}
```

### Tool.Content（多模态输出）

```ts
type Content =
  | { type: "text", text: string }
  | { type: "file", data: Uint8Array, mime: string, name?: string }
```

## 内置工具清单

### 文件操作

#### `bash`（~207 行）
- **路径**：`core/src/tool/bash.ts`
- **输入**：`{ command: string, workdir?: string, timeout?: number }`
- **输出**：`{ exit?: number, truncated: boolean, timeout?: boolean, output: string, warnings?: string }`
- **超时**：默认 2 分钟，最大 10 分钟
- **截断**：最大输出 1MB
- **特色**：跨平台进程管理（spawn）+ 超时 kill + 工作目录隔离

#### `edit`（~223 行）
- **路径**：`core/src/tool/edit.ts`
- **输入**：`{ path: string, oldString: string, newString: string, replaceAll?: boolean }`
- **输出**：`{ files: FileDiff.Info[], replacements: number }`
- **设计**：精确字符串替换（非行号编辑），支持 BOM 处理、行尾规范化（`\n`/`\r\n`）、`replaceAll` 批量替换

#### `read`（~117 行）
- **路径**：`core/src/tool/read.ts`
- **输入**：`{ path: string, offset?: number, limit?: number }`
- **输出**：`TextPage | ListPage | ImageContent`
- **三种模式**：
  - 文本文件：分页读取（offset + limit）
  - 目录：返回文件列表
  - 图片：JPEG/PNG/GIF/WebP → base64

#### `write`（~101 行）
- **路径**：`core/src/tool/write.ts`
- **输入**：`{ path: string, content: string }`
- **输出**：`{ operation: "write", target: string, resource: string, existed: boolean }`

### 搜索工具

#### `glob`（~105 行）
- **路径**：`core/src/tool/glob.ts`
- **输入**：`{ pattern: string, path?: string, limit?: number }`
- **输出**：`FileSystem.Entry[]`
- **实现**：底层调用 ripgrep

#### `grep`（~137 行）
- **路径**：`core/src/tool/grep.ts`
- **输入**：`{ pattern: string, path?: string, include?: string, limit?: number }`
- **输出**：`FileSystem.Match[]`
- **格式化**：`Found N matches\nfile:\n  Line N: text`

### Agent 协调工具

#### `task`（子代理调度）
- **路径**：`core/src/tool/task.ts`
- **输入**：`{ subagent_type: string, description: string, prompt: string, background?: boolean }`
- **功能**：启动子 agent 执行任务，支持后台模式和 task_id 复用

#### `skill`（~109 行）
- **路径**：`core/src/tool/skill.ts`
- **输入**：`{ name: string }`
- **输出**：`{ name: string, directory: string, output: string }`
- **限制**：最多加载 10 个文件
- **输出格式**：XML `<skill_content>` 标签

#### `plan`（Plan 模式）
- **路径**：`core/src/tool/plan.ts`
- **功能**：进入/退出计划模式，保存计划到 `.opencode/plans/`

#### `question`
- **路径**：`core/src/tool/question.ts`
- **功能**：向用户提问（多选/单选/文本）

### 外部工具

#### `webfetch`（Web 获取）
- **路径**：`core/src/tool/webfetch.ts`
- **功能**：HTTP GET → HTML → Markdown 转换

#### `websearch`（Web 搜索）
- **路径**：`core/src/tool/websearch.ts`
- **功能**：搜索引擎查询 → 结构化结果

### 专用工具

#### `apply_patch`（Patch 应用）
- **路径**：`core/src/tool/apply-patch.ts`
- **功能**：解析 `*** Begin/End Patch ***` 格式 → 应用到文件

#### `todowrite`（Todo 管理）
- **路径**：`core/src/tool/todowrite.ts`
- **功能**：创建/更新/管理 Todo 列表

#### `lsp`（LSP 查询）
- **路径**：`core/src/tool/lsp.ts`
- **功能**：LSP 符号查询（定义/引用/诊断/符号）

#### `shell`（Shell 环境）
- **路径**：`core/src/tool/shell.ts`
- **功能**：交互式 Shell 环境管理

## 工具注册流程

```ts
// opencode/src/tool/registry.ts
ToolRegistry.register([
  BashTool,
  EditTool,
  ReadTool,
  WriteTool,
  GlobTool,
  GrepTool,
  TaskTool,
  SkillTool,
  PlanTool,
  QuestionTool,
  WebFetchTool,
  WebSearchTool,
  ApplyPatchTool,
  TodoWriteTool,
  LspTool,
  ShellTool,
  // ... 插件提供的工具
])
```

## 模型输出格式化

每个工具可定义 `toModelOutput(output)` 方法，将结构化输出转为模型友好的文本。Agent 在流式响应中会以 `tool_result` 角色接收这些输出。

## 输出截断

- **文件**：`core/src/tool/truncate.ts`
- **策略**：超长输出自动截断 + 显示截断提示
- **bash 工具**：最大 1MB（`MAX_CAPTURE_BYTES`）
- **其他工具**：按字符数限制，显示 `(truncated)` 标记
