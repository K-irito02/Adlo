# ESLint + Prettier + TypeScript 全量代码质量修复

> 日期：2026-06-04 | 来源：全量前置检查运行与修复（ESLint v9 + Prettier + tsc + Clippy 四维门禁）
> 范围：前端 340+ 文件，Rust 74+ 文件，清理 ~200 个 ESLint warning + 16 个 TS 编译错误

## 工作内容

运行 ESLint v9（`no-unused-vars`、`no-explicit-any`、`react-refresh/only-export-components`、`prettier/prettier` 等规则）、Prettier 格式化、TypeScript `noEmit` 检查、Rust `cargo clippy` + `cargo fmt`。四维门禁全部清零。

## 关键经验

### 1. `_param` 解构重命名陷阱

TypeScript-ESLint 的 `no-unused-vars` 规则要求对未使用的接口参数加 `_` 前缀。但**不能直接在解构中写 `_param`**——这是解构赋值，不是参数重命名。

```typescript
// ❌ 错误：创建了新的变量名 `_param`，不解构原来的 `param`
function Foo({ _param }: Props) { ... }

// ✅ 正确：使用冒号重命名语法
function Foo({ param: _param }: Props) { ... }
```

错误写法会导致运行时 bug：`_param` 变成 `undefined`，因为组件在寻找名为 `_param` 的 prop，而不是名为 `param` 的 prop。

**AI 工具尤其容易犯此错误**——人工 review 时必须检查 destructuring 中的 `_` 前缀是否用了冒号重命名语法。

### 2. `any` → 具体类型引发级联编译错误

当把 interface 中的 `param: any` 改为具体类型后，所有消费该 interface 的地方都必须同步更新。修复策略：

- **自底向上修复**：先修复最底层的类型定义（domain types、kernel types），再修复中层组件 props，最后修复顶层组件
- 或者使用**类型断言**在第三方库边界处保留 `as unknown as ...` 而非 `any`（例如 react-window 的 `rowComponent` prop 类型）

### 3. `react-refresh/only-export-components` 组件拆分要点

将非组件导出拆到独立文件时，必须同步更新所有 import 该文件的地方：

```typescript
// 拆分前：fileTree.tsx 同时导出组件和工具函数
export { FileTree, useFileTree };

// 拆分后：fileTree.utils.ts 只导出工具函数
// 必须在所有 import { useFileTree } from './fileTree' 的地方改为
// import { useFileTree } from './fileTree.utils'
```

**工作流**：拆出一个文件后 → 全局搜索旧 import 路径 → 批量替换 → 下一个文件。

### 4. `no-explicit-any` 在图书馆接处的特殊处理

- **react-window v2** 的 `rowComponent` prop 类型复杂（`ListProps<RowProps>["rowComponent"]`），直接类型转换会失败。安全方案：`as unknown as ListProps<RowProps>["rowComponent"]`
- **i18n 类型**（`CopyDict`）缺少 key 时，TypeScript `satisfies` 约束会正确报错，补充 key 即可

### 5. Prettier + ESLint 集成注意

当前 ESLint flat config 中未配置 `eslint-config-prettier`，Prettier 格式问题以 `prettier/prettier` **warning** 形式从 ESLint 报出。需运行 ESLint `--fix` 来自动应用 Prettier 格式化。

### 6. 多导入路径合并

同一个 package 有多个 import 语句时（如 `@adlo/kernel`），应合并为单条导入以减少冗余：

```typescript
// ❌ 分开导入
import type { GitBranchSummary } from '@adlo/kernel';
import type { ModelGatewayHealthSnapshot } from '@adlo/kernel';

// ✅ 合并导入
import type {
  GitBranchSummary,
  ModelGatewayHealthSnapshot,
} from '@adlo/kernel';
```

## 四维门禁验证命令

```bash
# Rust
cd adlo && cargo clippy --workspace --all-targets && cargo fmt --all -- --check

# TypeScript
cd adlo/frontend && npx tsc --noEmit

# ESLint + Prettier（一体化）
cd adlo/frontend && npx eslint . && npx prettier --check "src/**/*.{ts,tsx}"
```

## 影响文件统计

- 修改文件：116 个（前端 TypeScript/TSX）
- 新增文件：5 个（`react-refresh` 拆分）
- 删除行数：1445 行
- 新增行数：922 行
- 净减：523 行
