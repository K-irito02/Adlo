# Effect-TS 编码模式

> OpenCode 全栈使用 Effect-TS 4.0.0-beta.83 作为核心运行时。以下是项目中最常用的模式。

## 1. 服务定义三组件

每个领域模块必须定义三个组件：

```ts
// ① Interface — 纯类型契约
export interface Interface {
  list(): Effect<readonly Info[], Error>
  get(id: ID): Effect<Info, Error>
  create(input: CreateInput): Effect<Info, Error>
}

// ② Context.Tag — 依赖注入标记
export const Service = Context.GenericTag<Interface>("@opencode/Service")

// ③ Layer — 具体实现（依赖注入组合）
export const node = Layer.effect(Service, Effect.gen(function*() {
  const db = yield* Database.Service
  const event = yield* Event.Service

  return {
    list: () => db.query(/* ... */),
    get: (id) => db.query(/* WHERE id = ? */).pipe(Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new NotFoundError()),
        onSome: (v) => Effect.succeed(v)
      })
    )),
    create: (input) => Effect.gen(function*() {
      const result = yield* db.insert(input)
      yield* event.publish(new CreatedEvent(result))
      return result
    })
  } satisfies Interface
}))
```

## 2. Effect.gen 生成器模式（核心推荐）

```ts
// ✅ 推荐：Effect.gen + yield*（清晰的条件流程）
const result = yield* Effect.gen(function*() {
  const cfg = yield* Config.Service
  const session = yield* Session.get(id)
  // yield* 自动展开 Effect / Either / Option
  // 等价于 flatMap 链
})

// ❌ 禁止：深层 .pipe() 嵌套
// ❌ 禁止：手动 flatMap 调用
// ❌ 禁止：try/catch（使用 Effect.catchAll / Effect.catchTag）
```

## 3. Error 处理

```ts
// ① TaggedError — 类型化错误
class NotFoundError extends TaggedError("NotFoundError")<{
  resource: string
  id: string
}> {}

// ② 错误传播（不用 try/catch）
const result = yield* Effect.gen(function*() {
  const data = yield* getData(id)  // 自动传播错误
  // ...
}).pipe(
  Effect.catchTag("NotFoundError", (e) =>
    Effect.succeed(defaultValue)
  ),
  Effect.catchAll((e) =>
    Effect.logError("Unexpected error", e).pipe(
      Effect.andThen(Effect.fail(new InternalError()))
    )
  )
)

// ③ 错误类型模式
export const Error = TaggedError<{
  operation: string
  message: string
  cause?: unknown
}>
```

## 4. Schema 定义（@effect/schema）

```ts
// ① Effect Schema（编译时 + 运行时类型安全）
class Info extends Schema.Class<Info>("Info")({
  id: Schema.String,
  name: Schema.String,
  createdAt: Schema.DateFromString,
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

// ② Branded Types（唯一标识符）
type ID = string & Brand.Brand<"@opencode/ID">
const ID = Schema.String.pipe(Schema.brand("@opencode/ID"))

// ③ 编码/解码
const encoded = Schema.encodeSync(Info)(info)
const decoded = Schema.decodeSync(Info)(raw)
```

## 5. Effect Context 依赖声明

```ts
// ① 服务消费（通过 yield*）
const session = yield* Session.Service  // 自动从 Context 获取

// ② 依赖声明（Layer 组合）
const layer = Layer.effect(Service, Effect.gen(function*() {
  // 声明依赖：必须有 Database.Service
  const db = yield* Database.Service
  // ...
})).pipe(
  Layer.provide(Database.node)  // 注入依赖
)

// ③ 多层组合
const AppLayer = Layer.mergeAll(
  Layer.provide(Agent.node, AgentLayer),
  Layer.provide(Session.node, SessionLayer),
  Layer.provide(Config.node, ConfigLayer),
)
```

## 6. 并发控制

```ts
// ① Effect.forEach — 并发批量操作
const results = yield* Effect.forEach(
  items,
  (item) => processItem(item),
  { concurrency: 5 }  // 最大并发 5
)

// ② KeyedMutex — 按键锁（防重复）
const mutex = yield* KeyedMutex.make<string>()

const result = yield* mutex.use(id, Effect.gen(function*() {
  // 同一 id 的并发调用串行化
  return yield* expensiveOperation(id)
}))

// ③ Effect.all — 并行执行
const [a, b, c] = yield* Effect.all([
  fetchA(),
  fetchB(),
  fetchC(),
], { concurrency: "unbounded" })
```

## 7. State 模式

```ts
// 自定义 Draft/Transformable（非 Zustand）
interface Draft<T> {
  list(): Effect<readonly T[]>
  get(id: ID): Effect<T>
  update(id: ID, input: Partial<T>): Effect<T>
  remove(id: ID): Effect<void>
}

// 实现（基于 Ref + Effect）
const makeDraft = <T>() => Effect.gen(function*() {
  const ref = yield* Ref.make<readonly T[]>([])
  return {
    list: () => Ref.get(ref),
    // ...
  } satisfies Draft<T>
})
```

## 8. Scope 管理

```ts
// ① 子 Scope（自动清理）
const result = yield* Effect.scoped(Effect.gen(function*() {
  const resource = yield* acquire()
  yield* Effect.addFinalizer(() => release(resource))
  return yield* use(resource)
}))

// ② Scope 传播
// Layer.effect 自动创建 Scope，组件卸载时清理
export const node = Layer.effect(Service, Effect.gen(function*() {
  // 所有 yield* 获取的资源在 Layer 关闭时自动清理
}))
```

## 9. Stream 处理

```ts
// ① LLM 流式响应
const stream = yield* LLM.stream(config)
  .pipe(
    Stream.map(parseChunk),
    Stream.filter(isValid),
    Stream.runForEach(chunk => ui.update(chunk))
  )

// ② 事件流
const events = yield* Event.subscribe(topic)
  .pipe(
    Stream.tap(event => console.log(event)),
    Stream.runDrain
  )
```

## 10. 禁止模式

| 禁止 | 替代方案 |
|------|---------|
| `try/catch` | `Effect.catchTag` / `Effect.catchAll` / `Effect.catchAllDefect` |
| `Promise.then/catch` | `Effect.promise(() => promise)` / `Effect.tryPromise` |
| `async/await` | `Effect.gen(function*() { ... })` |
| `any` 类型 | 精确的 `Schema` 定义 |
| 手动 `flatMap` | `Effect.gen` + `yield*` |
| `throw` / `reject` | `Effect.fail(error)` / `TaggedError` |
| 裸 `setTimeout/Interval` | `Effect.sleep` / `Effect.schedule` |
| 手动资源清理 | `Effect.acquireRelease` / `Scope` |
