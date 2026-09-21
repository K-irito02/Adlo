# 变更面板语法高亮修复

> 日期：2026-06-05 | 来源：变更面板（InlineDiffViewer / SideBySideDiffViewer）语法高亮失效问题排查与修复
> 涉及：`@codemirror/language`、pnpm 传递依赖、Vite 预构建缓存

## 问题现象

变更面板中的 CodeMirror Diff 编辑器（InlineDiffViewer 和 SideBySideDiffViewer）**无语法高亮**，代码以纯文本形式显示。

调试日志显示：

- `langFacet=null`——通过 `state.facet(language)` 读取到的语言 Facet 值为空
- 但 `state.facet(Extension)` 中语言扩展已正确加载（`exts=1`）
- 对比发现 **Facet ID 不匹配**：Language 对象内部注册的 Facet ID=84，但代码中导入的 `language` Facet ID=159

## 诊断过程

### 第一阶段：排查代码逻辑

怀疑是编辑器创建时序问题——语言扩展尚未加载完成时就创建了 EditorView。修改为"先等待、后创建"模式：等待语言加载完成后再创建编辑器实例。

**结果**：无效。语言扩展确实已加载，只是 Facet 读取不到。

### 第二阶段：排查包版本

怀疑 `@codemirror/language` 存在多版本冲突导致 Facet 实例不一致。

```bash
# 检查 @codemirror/language 的物理副本数
pnpm ls @codemirror/language
```

确认 `@codemirror/language@6.12.3` 仅有一份物理副本。

**结果**：无效。单一版本，但仍有两个 Facet 实例。

### 第三阶段：深度底层诊断

检查 CodeMirror 状态内部结构：

```typescript
// 检查 state.config 中的 Facet 存储
state.config.address // → 存储所有 Facet 值的数组
state.config.address[languageFacet.id] // → undefined

// 检查 Language 对象内部的 Facet ID
languageFacet.id // → 159（代码中导入的 language Facet）
// Language 对象内部持有的是另一个 language Facet 实例，ID=84
```

关键发现：

- `state.config.address[languageFacet.id]` 为 `undefined`，说明该 Facet 没有任何值被注册
- 但 DOM 上 `data-language` 属性正确存在——这是 `Language.extension` 中 `contentAttributes.compute` 的副作用，与 language Facet 的值无关
- 最终确认：`@codemirror/language` 被加载了两次，创建了两个不同的 `language` Facet 实例

## 根本原因

```
┌────────────────────────────────────────────────────────────────┐
│ pnpm + Vite 模块解析机制                                        │
│                                                                │
│  直接依赖 → node_modules/.pnpm/@codemirror+language@6.12.3     │
│       ↑  import { language } from '@codemirror/language'      │
│       ↑  Facet ID = 159                                       │
│                                                                │
│  传递依赖 → node_modules/.pnpm/.../@codemirror+language@6.12.3 │
│       ↑  @codemirror/lang-json 等间接依赖                      │
│       ↑  Facet ID = 84                                        │
│                                                                │
│  → Vite 将同一包解析为两个不同模块实例                          │
│  → @codemirror/language 模块代码被执行两次                     │
│  → 两个独立的 language Facet 被创建（ID=84 vs ID=159）         │
│  → Language 对象将值注册到 Facet ID=84                         │
│  → 代码通过 Facet ID=159 读取，始终为 null                     │
└────────────────────────────────────────────────────────────────┘
```

`@codemirror/language` **之前仅作为传递依赖存在**——通过 `@codemirror/lang-json`、`@codemirror/lang-markdown` 等语言包间接引入。代码中通过 `import { language } from '@codemirror/language'` 直接导入时，pnpm + Vite 环境下**传递依赖和直接依赖被解析为不同的模块实例**，导致 CodeMirror 6 的 Facet 单例模式失效。

## 修复方法

### 1. 添加直接依赖

在 `frontend/package.json` 中添加：

```json
{
  "dependencies": {
    "@codemirror/language": "^6.12.3"
  }
}
```

### 2. 清除 Vite 预构建缓存

```powershell
# 删除 Vite 的依赖预构建缓存
Remove-Item -Recurse -Force frontend/node_modules/.vite/
```

### 3. 重启开发服务器

```powershell
# 先停止原有 dev server，然后重新启动
pnpm run dev:browser
```

### 4. 验证

重启后，变更面板中所有语言（JSON、Markdown、TypeScript 等）均正确显示语法高亮。

## 经验教训

### 1. CodeMirror 6 核心包必须作为直接依赖

`@codemirror/language`、`@codemirror/state`、`@codemirror/view` 等 CodeMirror 6 核心包**必须显式添加到 `package.json` 的 `dependencies` 中**，不能依赖传递依赖。这些包内部使用单例模式（Facet、Annotation、StateEffect 等），多实例会导致功能异常。

### 2. 最直接的诊断方法

当怀疑 Facet 注册问题时，直接检查 CodeMirror 状态内部结构：

```typescript
// 检查 language Facet 是否有值
const langFacet = state.facet(language);
console.log('langFacet:', langFacet);

// 检查 Facet ID
console.log('language facet id:', language.id);

// 检查 state.config.address 中该 ID 对应的值
console.log('address[language.id]:', state.config.address[language.id]);

// 检查 state.config.address 有哪些 key
console.log('address keys:', Object.keys(state.config.address));
```

如果 `state.config.address[language.id]` 为 `undefined`，说明 Facet 实例不一致。

### 3. pnpm + Vite 的传递依赖陷阱

pnpm 的严格模块隔离机制 + Vite 的预构建优化，可能导致同一包被加载多次：

| 场景 | 结果 |
|------|------|
| 直接依赖 + 传递依赖指向同一版本 | 仍可能被解析为不同实例 |
| 单例模式包（Facet、Context、Registry 等） | 功能异常，难以排查 |
| 仅在 `package.json` 中存在不够 | 必须清除 `.vite/` 缓存 |

**修复后验证步骤**：

```bash
pnpm ls @codemirror/language --depth=0
# 确认在直接依赖列表中
```

### 4. `data-language` 属性的误导性

DOM 元素上存在 `data-language` 属性**并不代表 language Facet 已正确注册**。这是 `Language.extension` 中 `contentAttributes.compute([language])` 的副作用——它只在 `Language` 对象被作为扩展安装时计算一次，与后续通过 `state.facet(language)` 读取的 Facet 值不是同一路径。

### 5. 排查顺序建议

当遇到类似问题时，正确的排查顺序应为：

1. **检查依赖配置**（是否缺少直接依赖）——最简单、回报最高
2. **检查 Facet ID 一致性**——通过 `state.config.address` 底层诊断
3. **检查代码逻辑**——可能存在时序或条件问题

本次修复中先走了代码逻辑调整（步骤 3），浪费了时间。应该优先检查依赖配置。

## 相关文件

- `frontend/package.json` — 添加 `@codemirror/language` 直接依赖
- `frontend/src/app/features/changes-viewer/InlineDiffViewer.tsx` — 变更面板内联 Diff 组件
- `frontend/src/app/features/changes-viewer/SideBySideDiffViewer.tsx` — 变更面板并排 Diff 组件
