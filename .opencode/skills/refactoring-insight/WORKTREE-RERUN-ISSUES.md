# Git Worktree 新分支重新运行项目问题集

记录在隔离工作区（git worktree）新分支中重新运行项目时遇到的已知问题、根因分析与解决方案，供后续轮次快速排查。

---

## 问题 1：CodeMirror 多实例冲突

### 错误信息

```
Unrecognized extension value in extension set ([object Object]).
This sometimes happens because multiple instances of @codemirror/state
are loaded, breaking instanceof checks.
```

右侧面板提示："该面板遇到意外错误，已降级保护。"

### 触发条件

点击文件树中的文件，试图在 CodeMirror 编辑器中打开查看。

### 根因分析

`@uiw/react-codemirror@4.25.x` 的 peer dependency `codemirror@6.0.2` 依赖 `@codemirror/commands` → `@codemirror/state@6.7.0`，而项目中其他所有 CodeMirror 包（`@codemirror/lang-*`、`@codemirror/view` 等）均使用 `@codemirror/state@6.6.0`。两个不同的 `@codemirror/state` 实例导致 `instanceof` 检查失败。

### 修复方案

两步缺一不可：

#### 步骤 1：`frontend/package.json` — 添加直接依赖 + overrides

```json
{
  "dependencies": {
    "@codemirror/autocomplete": "^6.18.0",
    "@codemirror/commands": "^6.6.0",
    "@codemirror/lint": "^6.8.0",
    "@codemirror/search": "^6.5.0",
    "@lezer/highlight": "^1.2.0"
  },
  "pnpm": {
    "overrides": {
      "@codemirror/state": "6.6.0"
    }
  }
}
```

5 个直接依赖用于满足 Vite `optimizeDeps.include` 的预构建需求；`pnpm.overrides` 强制 `@codemirror/state` 在整个项目中只有 `6.6.0` 一个版本。

#### 步骤 2：`frontend/vite.config.ts` — 添加 resolve.dedupe

```ts
resolve: {
    dedupe: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
    ],
    alias: { ... },
}
```

`resolve.dedupe` 告诉 Vite 在预构建时始终使用同一份依赖实例，防止重复打包。

#### 步骤 3：清除缓存 + 重新安装

```powershell
Remove-Item -Recurse -Force "frontend/node_modules/.vite" -ErrorAction SilentlyContinue
pnpm install --no-frozen-lockfile
npx vite --port 5173
```

### 验证方法

```powershell
pnpm ls @codemirror/state
# 输出应仅显示 1 个版本：@codemirror/state@6.6.0
```

---

## 问题 2：pnpm frozen lockfile 错误

### 错误信息

```
[ERR_PNPM_OUTDATED_LOCKFILE] Cannot install with "frozen-lockfile"
```

### 触发条件

在 worktree 新分支中运行 `pnpm install`（未传 `--no-frozen-lockfile`）。

### 根因分析

pnpm workspace 默认启用 `--frozen-lockfile`（CI 模式），当 `pnpm-lock.yaml` 落后于 `package.json` 的变更时会拒绝安装。Worktree 的 lockfile 与 package.json 可能存在版本差异。

### 修复方案

```powershell
pnpm install --no-frozen-lockfile
```

---

## 问题 3：Vite 依赖解析失败

### 错误信息

```
Failed to resolve dependency: @codemirror/commands,
present in client 'optimizeDeps.include'. Are they installed?
```

### 触发条件

Vite 在 `optimizeDeps.include` 中列出了这些包，但 pnpm 将它们作为传递依赖（未在 `package.json` 的 `dependencies` 中声明），在 worktree 中未正确安装。

### 根因分析

Vite 的 `optimizeDeps.include` 中配置了 `@codemirror/commands`、`@codemirror/autocomplete`、`@codemirror/lint`、`@codemirror/search`、`@lezer/highlight`。这些包原本仅作为 `@uiw/react-codemirror` 的传递依赖存在。在标准安装中 pnpm 会将其提升到顶层 `node_modules`，但在某些 worktree 环境中提升失败或未正确安装。

### 修复方案

已在问题 1 中一并修复——将这 5 个包添加为 `package.json` 的 `dependencies`，确保它们被明确安装。

---

## 问题 4：TypeScript 文件大小写不匹配

### 错误信息

TypeScript 类型检查报导入路径与实际文件名大小写不一致。

### 触发条件

```typescript
import './multiworkspacebrowser'  // 小写
// 实际文件名：MultiWorkspaceBrowser.tsx  // 大写
```

### 根因分析

Windows 文件系统大小写不敏感，`import './multiworkspacebrowser'` 在 Windows 上能正常找到 `MultiWorkspaceBrowser.tsx`。但 TypeScript 严格模式（特别是 `forceConsistentCasingInFileNames: true`）会检测到这种不一致并报错。该问题在 Worktree 中因为重新运行类型检查而被发现。

### 修复方案

更新导入路径以匹配实际文件名的大小写：

```diff
- import './multiworkspacebrowser'
+ import './MultiWorkspaceBrowser'
```

---

## 问题 5：缺失 JsonValue 类型定义

### 错误信息

TypeScript 找不到模块 `crates/kernel/bindings/serde_json/JsonValue`。

### 触发条件

Rust `ts-rs` 自动生成 TypeScript 绑定时，`serde_json::Value` 对应 `JsonValue` 类型未被自动生成。

### 根因分析

`ts-rs` 不会为 `serde_json::Value` 这类外部类型自动生成绑定文件。需要手动补充 `JsonValue.d.ts` 类型定义。

### 修复方案

创建 `crates/kernel/bindings/serde_json/JsonValue.d.ts`：

```typescript
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
```

---

## 问题 6：Vite 缓存导致修改不生效

### 错误信息

无显式报错，但 `package.json` 变更后重启 dev server 仍出现旧依赖的问题。

### 触发条件

修改 `package.json` 后运行 `pnpm install`，且 `pnpm install` 报告 "Already up to date"。

### 根因分析

Vite 将预构建的依赖缓存到 `node_modules/.vite/deps/`。缓存文件不会自动失效，即使依赖已重新安装，Vite 仍使用旧缓存。如果 `pnpm install` 发现 lockfile 无变化（或 --frozen-lockfile 模式），它不会重新写入 `node_modules`，此时缓存与安装状态不同步。

### 修复方案

```powershell
# 清除 Vite 预构建缓存
Remove-Item -Recurse -Force "frontend/node_modules/.vite" -ErrorAction SilentlyContinue

# 重新安装（确保使用 --no-frozen-lockfile）
pnpm install --no-frozen-lockfile
```

---

## 通用修复命令速查

在 Worktree 新分支遇到运行问题时，按以下顺序排查：

```powershell
# 1. 环境准备
$env:Path = "D:\Program Files\nodejs;$env:Path"

# 2. 重新安装依赖
pnpm install --no-frozen-lockfile

# 3. 清除 Vite 缓存
Remove-Item -Recurse -Force "frontend/node_modules/.vite" -ErrorAction SilentlyContinue

# 4. 启动开发服务器
cd frontend
npx vite --port 5173
```

如果 TypeScript 类型检查失败：

```powershell
# 检查大小写一致性
pnpm --dir frontend run typecheck
```

如果 CodeMirror 编辑器崩溃：

```powershell
# 检查 @codemirror/state 版本是否唯一
pnpm ls @codemirror/state
```