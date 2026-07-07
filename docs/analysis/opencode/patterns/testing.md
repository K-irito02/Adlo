# 测试模式

> 源码：`core/test/`、`llm/test/`、`opencode/test/`、参考 `AGENTS.md`

## 测试框架

| 工具 | 用途 |
|------|------|
| Bun Test | 测试运行器（内置在 Bun 中） |
| Effect-TS Test | Effect 测试工具（`Effect.runPromise`） |
| Happy DOM | Web 组件测试（`app/happydom.ts`） |
| Playwright | E2E 测试（`app/playwright.config.ts`） |

## 测试运行

```bash
# 从 packages 目录运行（不能从仓库根运行）
cd packages/core && bun test
cd packages/llm && bun test

# 或通过根 package.json scripts
bun turbo test
```

## 测试目录结构

```
core/test/
├── preload.ts                # 全局测试预加载（mock 数据库）
├── lib/
│   ├── effect.ts             # Effect 测试工具
│   └── tool.ts               # Tool 测试工具
├── fixture/
│   └── git.ts                # Git 测试 Fixture
├── agent.test.ts
├── event.test.ts
├── git.test.ts
├── global.test.ts
├── model.test.ts
├── npm.test.ts
├── patch.test.ts
├── plugin.test.ts
├── policy.test.ts
├── shell.test.ts
├── skill.test.ts
└── state.test.ts

llm/test/
├── lib/
│   ├── effect.ts
│   ├── http.ts               # HTTP 测试工具
│   └── sse.ts                # SSE 测试工具
├── adapter.test.ts
├── auth.test.ts
├── exports.test.ts
├── llm.test.ts
├── prepare.test.ts
├── route.test.ts
├── schema.test.ts
└── tool.types.ts

opencode/test/
├── preload.ts
└── AGENTS.md
```

## 核心测试原则（来自 AGENTS.md）

> **避免 mock，测试实际实现。**

OpenCode 的测试哲学是测试实际代码，而不是大量 mock。这与许多 TypeScript 项目的做法不同。

## Effect 测试模式

```ts
import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"

describe("Session", () => {
  it("creates a session", async () => {
    const result = await Effect.gen(function*() {
      const session = yield* Session.create({ projectID: "test" })
      return session
    }).pipe(
      Effect.provide(TestLayer),  // 注入测试依赖
      Effect.runPromise
    )

    expect(result.id).toBeDefined()
  })

  it("handles not found", async () => {
    const result = await Effect.gen(function*() {
      return yield* Session.get("nonexistent" as Session.ID)
    }).pipe(
      Effect.provide(TestLayer),
      Effect.runPromise,
      Effect.catchTag("NotFoundError", () => Effect.succeed(null))
    )

    expect(result).toBeNull()
  })
})
```

## 测试工具

```ts
// core/test/lib/effect.ts
// Effect 测试专用工具
export const TestLayer = Layer.mergeAll(
  Database.memory,  // 内存 SQLite
  Config.test,
  Agent.test,
  // ...
)

export const testEffect = <E, A>(effect: Effect.Effect<A, E, Scope>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)))
```

## Git 测试 Fixture

```ts
// core/test/fixture/git.ts
// 创建临时 Git 仓库用于测试
export const createTestRepo = () => {
  // 创建临时目录 + git init + 初始 commit
  // 返回 { dir, repo, cleanup }
}
```

## 关键设计要点

1. **不 mock**：优先使用真实实现，测试数据库用内存 SQLite
2. **Layer 注入**：通过 `Effect.provide(TestLayer)` 注入测试依赖
3. **Fixture 隔离**：每个测试创建独立的临时环境
4. **异步测试**：通过 `Effect.runPromise` 运行 Effect 测试
5. **测试预加载**：`preload.ts` 设置全局 mock（数据库路径、环境变量）
6. **不能从仓库根运行**：测试限制在包目录内运行（`bun test` 范围限制）
