# OpenCode 深度分析（五）：项目规范与开发规范

> 源码参考路径：`references/opencode/AGENTS.md`、`references/opencode/CONTRIBUTING.md`、`references/opencode/CONTEXT.md`

---

## 1. 编码规范

### 1.1 通用原则

| 规则 | 说明 |
|------|------|
| **单函数原则** | 逻辑保留在单一函数内，除非拆分带来明确的复用或组合收益 |
| **禁止预提取** | 不要预先提取只使用一次的 helper，在调用处内联 |
| **避免 `try/catch`** | 尽可能用 `.catch(...)` 替代 |
| **禁止 `any`** | 使用精确类型 |
| **优先 Bun API** | 如 `Bun.file()` |
| **类型推断优先** | 避免显式类型注解/接口，除非导出或需要明确语义 |
| **函数式数组方法** | `flatMap`、`filter`、`map` 优先于 `for` 循环 |
| **禁止嵌套 service yield** | Effect 中先绑定再调用 |

### 1.2 变量与解构

```ts
// Good - 内联只使用一次的值
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad - 不必要的中间变量
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()

// Good - 点号保持上下文
obj.a; obj.b;

// Bad - 不必要的解构
const { a, b } = obj;
```

### 1.3 Imports 规范

| 规则 | 说明 |
|------|------|
| **禁止别名** | 不使用 `import { foo as bar }` |
| **禁止 star imports** | 不使用 `import * as Foo` |
| **命名空间导入** | 通过模块自己的导出命名空间，如 `import { Project } from ".../project"` 然后 `Project.ID` |
| **动态导入** | 仅用于启动敏感的入口点中的重型模块 |

### 1.4 控制流：禁止 else + 提前返回

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### 1.5 复杂逻辑：Happy Path 模式

主函数保持为 happy path，验证分支或辅助细节提取为下方的小 helper：

```ts
export function loadThing(input: unknown) {
  const config = requireConfig(input)
  const metadata = readMetadata(input)
  return createThing({ config, metadata })
}

function requireConfig(input: unknown) { ... }
```

- Helper 放在函数下方，靠近支持的代码
- 只有命名了真实概念时才提取
- 除非执行 effectful 工作，否则不从 helper 返回 `Effect`

### 1.6 Drizzle Schema 定义

```ts
// Good - snake_case 字段名
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad - 需要显式列名
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

---

## 2. 分支、Commit 与 PR 约定

### 2.1 分支命名

- 最多 3 个单词，短横线分隔
- 禁止：斜杠、类型前缀（`feat/`、`fix/`）
- 示例：`session-recovery`、`fix-scroll-state`、`regenerate-sdk`

### 2.2 Commit 与 PR 标题

格式：`type(scope): summary`

| 类型 | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `chore` | 维护任务 |
| `refactor` | 重构 |
| `test` | 测试 |

Scope（可选）：`core`、`opencode`、`tui`、`app`、`desktop`、`sdk`、`plugin`

### 2.3 PR 要求

1. **Issue First Policy**：所有 PR 必须引用已有 issue
2. **PR 模板**：必须完整填写（What、Type、Verification、Checklist）
3. **禁止 AI 文字墙**：PR 描述必须简洁、用自己的话编写
4. **UI 变更**：必须附带截图/视频
5. **逻辑变更**：必须说明验证方式

---

## 3. 格式化配置

### 3.1 Prettier

```json
{
  "semi": false,
  "printWidth": 120
}
```

### 3.2 EditorConfig

```
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
```

### 3.3 oxlint 规则要点

| 规则 | 说明 |
|------|------|
| `typeAware: true` | 启用类型感知 lint |
| `no-base-to-string` | 防止 `[object Object]` |
| `no-floating-promises` | 捕获未处理的 Promise |
| `no-misused-spread` | 展开非 plain object |

关闭的规则及原因：

| 规则 | 原因 |
|------|------|
| `require-yield` | Effect 使用 `function*` + `Effect.gen` |
| `no-unassigned-vars` | SolidJS `let ref` 模式 |
| `no-unused-expressions` | SolidJS 响应式依赖跟踪 |
| `no-control-regex` | 有意匹配控制字符 |
| `no-shadow` | Effect 嵌套 `function*` 闭包 |
| `consistent-function-scoping` | 命名空间密集型代码库 |

---

## 4. 类型检查规范

- 后端包：`extends "@tsconfig/bun/tsconfig.json"`
- Web 包：Vite + `composite: true` + `emitDeclarationOnly: true`
- 类型检查工具：`tsgo --noEmit`（TypeScript Native），禁止直接运行 `tsc`
- 运行方式：`bun typecheck`（从包目录，非根目录）

---

## 5. 测试规范

### 5.1 核心原则

1. **尽可能避免 mock**：不使用 `globalThis.*`
2. **测试实际实现**：不将逻辑复制到测试中
3. **禁止从仓库根目录运行测试**：必须从各包目录运行
4. **禁止运行 `tsc` 直接类型检查**：始终使用 `bun typecheck`

### 5.2 Effect 测试模式

```ts
import { testEffect } from "packages/opencode/test/lib/effect.ts"

// 显式测试 layer，而非临时 managed runtime
// 使用 it.live(...) 测试真实平台行为
it.live("should work with real filesystem", () => { ... })
```

### 5.3 测试工具链

| 层级 | 工具 | 命令 |
|------|------|------|
| 单元测试 | `bun test` | `bun test --only-failures` |
| 浏览器测试 | `bun test --conditions=browser` | `bun test:browser` |
| E2E | Playwright | `bun test:e2e:local` |
| HttpAPI | 自定义脚本 | `bun test:httpapi` |

---

## 6. 代码生成规则

- 修改公共 Protocol 或 Server `HttpApi` 后，运行 `bun run generate`（从 `packages/client`）
- **禁止**直接编辑 `src/generated` 或 `src/generated-effect`
- CI 自动在 `dev` 分支 push 时生成并 commit

---

## 7. 安全边界

| 边界 | 说明 |
|------|------|
| **无沙箱** | 权限系统是 UX 功能，不是安全隔离 |
| **Server Mode** | 需 `OPENCODE_SERVER_PASSWORD` 环境变量启用 Basic Auth |
| **排除项** | Server 访问、沙箱逃逸、MCP server 行为 |
| **禁止 AI 安全报告** | 提交 AI 生成的安全报告自动封禁 |

---

## 8. Husky Pre-Push Hook

Push 前自动：
1. 检查 Bun 版本是否匹配 `packageManager` 字段（`bun@1.3.14`）
2. 运行 `bun typecheck`

---

## 9. 自我引导模式（OpenCode 用自身管理自身）

OpenCode 通过 `.opencode/` 目录实现了高度自动化的自我管理：

| 配置 | 文件 | 用途 |
|------|------|------|
| Agent | `agent/triage.md` | Issue 自动分类（按团队分工分配） |
| Agent | `agent/duplicate-pr.md` | 重复 PR 检测 |
| Tool | `tool/github-triage.ts` | GitHub Issue 自定义分配工具 |
| Skill | `skills/effect/SKILL.md` | Effect v4 编码指导 |
| Config | `opencode.jsonc` | Provider、Permission、MCP 配置 |
| Config | `tui.json` | TUI 插件和快捷键配置 |

### CI 集成

`/review` 命令在 PR 评论中触发 OpenCode agent 自动代码审查，检查风格指南违规并评论具体行。

---

## 10. 依赖管理策略

### Bun Workspace + Catalog

```json
{
  "workspaces": {
    "packages": ["packages/*", "packages/console/*", "packages/stats/*", ...],
    "catalog": {
      "effect": "4.0.0-beta.83",
      "solid-js": "1.9.10"
    }
  }
}
```

### 供应链安全

```
[install]
exact = true                   # 精确版本，无 ^ 语义范围
minimumReleaseAge = 259200     # 仅安装发布 ≥3 天的包
```

### Patched Dependencies

使用 Bun 的 `patchedDependencies` 修补 14 个依赖，包括 `solid-js`、`effect`、`@ai-sdk/*`。

---

## 11. 对当前项目的规范借鉴

| OpenCode 规范 | 你的项目 | 可借鉴方向 |
|-------------|---------|----------|
| AGENTS.md 作为编码规范源 | `.trae/rules/*.md` | 已有完整规范体系，可补充 Happy Path 模式等 |
| CONTEXT.md 领域术语 | 无 | 建议为复杂模块建立术语表 |
| Branch 命名（kebab-case + 最多3词） | 当前混合风格 | 可评估统一 |
| Commit 规范（conventional commits） | 未明确 | 建议采用 |
| 禁止 AI 文字墙原则 | 未明确 | 建议作为贡献规范 |
| oxlint 配置实践 | ESLint | 可参考 type-aware lint 策略 |
| 最小发布年龄策略 | 未使用 | 安全性提升 |
| Self-bootstrapping (.opencode/) | `.trae/` 目录 | 可增强为 AI 管理入口 |
