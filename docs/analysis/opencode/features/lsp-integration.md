# LSP 集成

> 源码：`opencode/src/lsp/`、`core/src/tool/lsp.ts`

## 架构

```
LSP 客户端 (opencode/src/lsp/)
├── client.ts       # LSP 客户端核心
├── launch.ts       # 服务器启动管理
├── server.ts       # 服务器进程管理
├── diagnostic.ts   # 诊断结果处理
├── language.ts     # 语言支持配置
└── lsp.ts          # 入口/组装

LSP Tool (core/src/tool/lsp.ts)
└── LspTool         # 暴露给 Agent 的 LSP 查询工具
```

## 技术栈

| 依赖 | 用途 |
|------|------|
| `web-tree-sitter` | WASM Tree-sitter 解析器 |
| `tree-sitter-bash` | Bash 语法树 |
| `tree-sitter-powershell` | PowerShell 语法树 |
| `vscode-languageserver-protocol` | LSP 协议实现 |

## LSP 工具

```ts
// core/src/tool/lsp.ts
LspTool = {
  name: "lsp"
  input: {
    action: "definition" | "references" | "hover" | "symbols" | "diagnostics"
    uri: string          // file:// URI
    position?: { line: number, character: number }
  }
  output: {
    definitions?: Location[]
    references?: Location[]
    hover?: Hover
    symbols?: SymbolInformation[]
    diagnostics?: Diagnostic[]
  }
}
```

## SymbolKind 枚举

完整的 LSP SymbolKind 映射（1-27），包括：
Class, Method, Function, Interface, Enum, Variable, Constant, Property, etc.

## 服务器启动管理

```ts
// opencode/src/lsp/launch.ts
LSPLaunch = {
  // 按语言启动对应的 LSP 服务器
  start(language: string, rootPath: string): Effect<LSP.Server>
  
  // 支持的语言服务器
  servers: Map<Language, ServerConfig>
}
```

## 诊断流程

```
用户请求 LSP 诊断
  │
  ▼
LspTool.execute({ action: "diagnostics", uri })
  │
  ▼
LSP Server → textDocument/diagnostic
  │
  ▼
diagnostic.ts → 解析诊断结果
  │
  ▼
按严重程度分类 → Error/Warning/Info/Hint
  │
  ▼
格式化输出（文件路径 + 行号 + 消息）
```

## 配置

```ts
// core/src/config/lsp.ts
LSP.Config = {
  enabled: boolean
  servers: {
    [language: string]: {
      command: string      // LSP server 命令
      args?: string[]
      initializationOptions?: Record<string, unknown>
    }
  }
}
```

## 关键设计要点

1. **懒启动**：LSP 服务器在首次查询时才启动
2. **进程隔离**：每个语言服务器独立进程，崩溃不影响主进程
3. **超时保护**：LSP 查询有超时限制，防止阻塞 Agent
4. **结果缓存**：诊断结果缓存，避免重复查询
5. **增量更新**：文件修改后仅重新诊断变更文件
