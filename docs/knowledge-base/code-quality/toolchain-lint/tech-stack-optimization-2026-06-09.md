# 技术栈优化经验 - 2026-06-09

## 背景

对 Adlo项目的技术栈进行全面优化，涵盖 Rust 后端、前端和工程基础设施共 10 项任务。核心目标：提升跨平台兼容性、性能与轻量化特性。

## 变更范围

| 层级 | 变更 |
|------|------|
| Rust 后端 | tokio features 精简（full→5特性）、ts-rs IPC 类型生成、密钥存储降级策略、Repository 模式封装 |
| 前端 | highlight.js 按需注册（190→9语言）、移除 react-markdown/remark-gfm 死依赖 |
| 工程设施 | CI/CD 流水线（GitHub Actions 四维门禁）、cargo-bloat 二进制大小监控、i18n 覆盖检查、Windows PTY 兼容测试 |
| 新 crate | `crates/credential/`（keyring + 加密文件双轨） |

## 经验教训

### 1. ts-rs `T \| null` vs TypeScript `T \| undefined` 类型冲突

ts-rs 默认 `null` 表示可选，而项目代码库一致使用 `undefined`。这是 ts-rs 与手写 TypeScript 接口最根本的摩擦点。

**教训**：生成的 TypeScript 类型应作为 **参考参考**，而非运行时依赖。核心 IPC 类型仍以手写 `ipc.ts` 为准。

```rust
// ts-rs 生成 → type Foo = { bar: string | null }
// 项目需要 → type Foo = { bar?: string }
```

**决策**：ts-rs 生成产物放入 `crates/kernel/bindings/`，加入 `.gitignore`，CI 只检查类型数量一致性。

### 2. `#[ts(type = "number")]` 属性语法

ts-rs 的 `#[ts(type = "...")]` 接受字符串参数，Rust 字段类型必须仍是合法 Rust 类型（如 `i64`），但 ts-rs 会将其映射为 `number`：

```rust
#[ts(type = "number")]
pub id: i64, // Rust 编译通过，生成 → id: number
```

若写成 `#[ts(type = number)]`（无引号），会导致 Rust 编译错误。

### 3. `i64` → `bigint` → `number` 的三层映射

- Rust: `i64`
- ts-rs 默认生成: `number`（`Int64` 策略）
- 项目需要: `number`

默认配置即可，无需额外 `#[ts(type = "...")]`。额外操作仅当需要 `#[ts(type = "number")]` 覆盖 ts-rs 默认映射行为时。

### 4. tokio features 精简不能盲目

`features = ["full"]` 被替换为 `rt-multi-thread`, `macros`, `process`, `sync`, `time`。但以下场景需要保留 `full`：

- **net**：若使用 `TcpStream`、`TcpListener` 等
- **io-util**：若使用 `AsyncReadExt`、`AsyncWriteExt`（某些 crate 通过 re-export 依赖）

**教训**：依赖分析需要检查 transitive dependencies 是否通过 `tokio::io::AsyncReadExt` 等路径引入隐含依赖。

### 5. 密钥存储必须双轨降级

`keyring` crate 在 Linux（无桌面环境/无 D-Bus）和 CI 环境中可能失败。必须提供 **加密文件回退**，而非直接 panic。

**架构**：
```
CredentialStore::new()
  ├── 尝试 keyring（platform native）
  └── 失败 → 加密文件（AES-256-GCM，密钥派生自机器指纹）
```

### 6. highlight.js 按需注册必须测试所有引用路径

将 `import hljs from 'highlight.js/lib/common'`（190语言）改为逐个注册 9 种语言时，需要全局搜索 `hljs.highlight` 的所有调用点验证路径是否仍然可用。`highlight.js/lib/common` 是聚合入口，切换后某些子路径可能失效。

### 7. react-markdown 和 remark-gfm 的依赖关系

移除 `react-markdown` + `remark-gfm` 时，发现 `@types/react` 是它们的传递依赖。删除前需确认 `@types/react` 是否被其他包依赖（在 React 19 项目中必然有直接依赖，但需要验证版本兼容性）。

### 8. CI 中的 Windows PTY 测试需要条件编译

`portable-pty` 的 Windows 测试使用 `#[cfg(target_os = "windows")]` 包围 Windows 特有测试，并使用 `#[cfg(not(target_os = "windows"))]` 为其他平台提供占位测试。

### 9. 二进制大小分析需要基准线

`cargo bloat` 的输出需要对比优化前后的数据才有意义。建议首次运行建立基准线，后续每次优化后对比。

## 影响

- tokio 编译体积 -5~10%
- highlight.js bundle -860 lines（约 -12KB）
- 新增 CI 流水线覆盖 Rust lint/fmt + 前端 tsc/eslint + 测试
- 新增月度二进制大小监控
- 密钥存储在无 keyring 环境下可无缝降级
- 数据访问引入 Repository 模式，可测试性提升
