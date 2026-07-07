# 数据库模式（Drizzle ORM + SQLite）

> 源码：`core/src/database/`、`core/drizzle.config.ts`、`core/schema.json`

## 技术栈

| 技术 | 用途 |
|------|------|
| SQLite (bun:sqlite) | Bun 原生 SQLite 驱动 |
| better-sqlite3 | Node.js SQLite 驱动 |
| Drizzle ORM 1.0.0-rc.2 | ORM 层 |
| @effect/sql-sqlite-bun | Effect SQLite 客户端 |
| @effect/sql-sqlite-node | Node.js SQLite 客户端 |

## 表定义

```ts
// Drizzle 表定义（snake_case 字段名）
const sessionTable = sqliteTable("session", {
  id: text("id").primaryKey(),
  project_id: text("project_id").notNull(),
  parent_id: text("parent_id"),
  title: text("title"),
  status: text("status").notNull().default("active"),
  agent_id: text("agent_id").notNull(),
  model_ref: text("model_ref").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
})

const messageTable = sqliteTable("message", {
  id: text("id").primaryKey(),
  session_id: text("session_id").notNull().references(() => sessionTable.id),
  role: text("role").notNull(),
  content: text("content"),
  tool_calls: text("tool_calls"),  // JSON 序列化
  created_at: text("created_at").notNull(),
})
```

## Effect 数据库操作模式

```ts
// ① 查询（自动类型推断）
const session = yield* Effect.gen(function*() {
  const db = yield* SqliteClient
  return yield* db
    .select()
    .from(sessionTable)
    .where(eq(sessionTable.id, id))
    .pipe(Effect.map(rows => rows[0]))
})

// ② 插入
const result = yield* db
  .insert(sessionTable)
  .values({
    id: generateId(),
    project_id: projectId,
    status: "active",
    created_at: new Date().toISOString(),
  })
  .returning()

// ③ 更新
yield* db
  .update(sessionTable)
  .set({ status: "completed", updated_at: new Date().toISOString() })
  .where(eq(sessionTable.id, id))
```

## 条件导入（双平台）

```jsonc
// package.json
{
  "imports": {
    "#sqlite": {
      "bun": "./src/database/sqlite.bun.ts",
      "node": "./src/database/sqlite.node.ts"
    }
  }
}
```

```ts
// 使用
import { SqliteClient } from "#sqlite"
// Bun 运行时自动使用 sqlite.bun.ts
// Node 运行时自动使用 sqlite.node.ts
```

## 迁移系统

**迁移文件**：`core/drizzle/`（38 个迁移文件，编号递增）

```ts
// drizzle.config.ts
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "turso",
})
```

## 数据库路径

```
Global.Path/data/<project_id>/opencode.db
```

每个项目独立的 SQLite 数据库文件。

## 关键模式

### JSON 字段

```ts
// Drizzle 不自带 JSON 支持，手动序列化/反序列化
const toolCalls = text("tool_calls")

// 写入
insert({ tool_calls: JSON.stringify(calls) })

// 读取
const calls = JSON.parse(row.tool_calls) as ToolCall[]
```

### 复合查询

```ts
const result = yield* db
  .select({
    session: sessionTable,
    messageCount: count(messageTable.id),
  })
  .from(sessionTable)
  .leftJoin(messageTable, eq(sessionTable.id, messageTable.session_id))
  .groupBy(sessionTable.id)
  .orderBy(desc(sessionTable.updated_at))
  .limit(limit)
  .offset(offset)
```

### 分页

```ts
interface ListResult<T> {
  items: T[]
  nextAnchor?: string    // 基于游标的分页（而非 offset）
}
```

## 关键设计要点

1. **每个项目独立数据库**：避免多项目数据混合
2. **snake_case 字段名**：Drizzle 字段使用 snake_case（与 SQLite 惯例一致）
3. **游标分页**：基于 `updated_at` 游标而非 offset（防止数据漂移）
4. **JSON 序列化**：复杂字段手动 JSON 序列化到 text 列
5. **自动迁移**：应用启动时自动运行待处理的迁移
