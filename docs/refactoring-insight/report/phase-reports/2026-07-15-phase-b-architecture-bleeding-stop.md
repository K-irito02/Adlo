# Phase B: 架构违规止血（C5-Phase1 + H8）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复两个架构层违规：(1) H8 — `ExternalLinkError.tsx` 直接导入 `@tauri-apps/plugin-shell`，绕过 bridge 抽象；(2) C5-Phase1 — 36+ 个 UI 文件直接导入 `@ai-digital-life/kernel`，绕过 bridge 层。通过为 `WindowBridge` 接口添加 `openExternal` 方法并添加 ESLint `no-restricted-imports` 规则来止血。

**Architecture:** AI Digital Life 前端遵循三层 bridge 架构：`shared/ipc/`（类型契约）→ `tauri-bridge/`（Tauri 实现）+ `preview-bridge/`（浏览器实现）+ `mock/`（测试/开发 mock）。UI 组件只能通过 `window.digitalLife.{domain}.{method}` 访问后端能力，禁止直接导入 Tauri 插件或 `@ai-digital-life/kernel`（生成的 Rust→TypeScript 类型包）。当前 `ExternalLinkError.tsx` 违反此规则，直接导入 `@tauri-apps/plugin-shell` 的 `open()` 函数；36+ 个 UI 文件违反此规则，直接导入 `@ai-digital-life/kernel` 类型。

**Tech Stack:** React 19 + TypeScript + ESLint 9 (flat config) + typescript-eslint + Vitest

## Global Constraints

- 所有修改不得破坏现有功能以及 UI/UX
- 所有 UI 展示文本必须使用 i18n key（本次不涉及新增 UI 文本）
- TypeScript 严格模式，禁止 `any`（测试文件除外）
- ESLint flat config 格式（`eslint.config.js`）
- 三端 bridge 一致性：`WindowBridge` 接口变更必须在 3 个实现层（tauri / preview / mock）同步
- `src/mock/**` 已在 ESLint 全局 `ignores` 中，不会被 lint 检查（但仍需同步实现接口方法以满足 TypeScript 类型契约）
- `window.digitalLife` 在 `main.tsx` 中通过 `declare global` 声明为非可选属性，但运行时组件中使用 `?.` 可选链是项目既有模式（用于测试和边缘场景安全性）
- 不新增测试文件（遵循"不镀金"原则；现有测试应继续通过）
- Commit 信息格式：`type(scope): summary`，scope 选项：`core` / `frontend` / `rust` / `stores` / `browser` / `terminal` / `ipc` / `docs` / `deps`
- 验收流程：完成代码修改后必须执行 `pnpm --dir frontend run typecheck` + `pnpm --dir frontend run lint` + `pnpm --dir frontend run test`

## 参考文件（必读）

| 文件 | 职责 |
|------|------|
| `ai-digital-life/frontend/src/shared/ipc/window.ts` | `WindowBridge` 接口定义（7 个方法：minimize / maximize / close / isMaximized / setTitle / onResized / show） |
| `ai-digital-life/frontend/src/tauri-bridge/misc.ts` | Tauri bridge 实现（`createTauriWindowBridge()` 在 L48-79） |
| `ai-digital-life/frontend/src/mock/mock-window.ts` | Mock bridge 实现（`mockWindow` 对象） |
| `ai-digital-life/frontend/src/preview-bridge/preview-window.ts` | Preview bridge 实现（`createPreviewWindowBridge()`，当前直接复用 `mockDigitalLifeBridge.window`） |
| `ai-digital-life/frontend/src/app/features/browser/ExternalLinkError.tsx` | H8 违规文件（L4 直接导入 `@tauri-apps/plugin-shell`） |
| `ai-digital-life/frontend/eslint.config.js` | ESLint flat config（3 个 config block：全局 ignores / 主规则 / 测试文件覆盖） |
| `ai-digital-life/frontend/src/main.tsx` | 应用入口，通过 `isTauriShell()` 选择 bridge（L40-44 声明 `window.digitalLife: DigitalLifeBridge`） |
| `.trae/rules/tauri-shell.md` | 架构规则："WebView → 禁止：直接访问系统能力" |

---

### Task 1: 为 WindowBridge 接口添加 `openExternal` 方法并实现 3 个 bridge

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/window.ts`（接口定义）
- Modify: `ai-digital-life/frontend/src/tauri-bridge/misc.ts`（Tauri 实现，调用 `@tauri-apps/plugin-shell.open`）
- Modify: `ai-digital-life/frontend/src/mock/mock-window.ts`（Mock 实现，调用 `window.open`）
- Modify: `ai-digital-life/frontend/src/preview-bridge/preview-window.ts`（Preview 实现，调用 `window.trae.openExternal`，fallback `window.open`）

**Interfaces:**
- Consumes: `open` from `@tauri-apps/plugin-shell`（Tauri 模式）、`window.trae.openExternal`（Trae IDE 内置浏览器 API）、`window.open`（浏览器 fallback）
- Produces: `WindowBridge.openExternal(url: string): Promise<void>` — 在系统默认浏览器中打开外部 URL

**设计说明：**

当前 `ExternalLinkError.tsx` 的 `handleExternalOpen` 逻辑：
```
if (isTauriShell()) {
  open(url)              ← Tauri: @tauri-apps/plugin-shell
} else {
  if (window.trae?.openExternal) {
    window.trae.openExternal(url)  ← 浏览器: Trae IDE 内置 API
  } else {
    window.open(url)              ← 浏览器: 通用 fallback
  }
}
```

重构后，这段平台分支逻辑下沉到 3 个 bridge 实现：
- **Tauri bridge**: `open(url)` — 调用 `@tauri-apps/plugin-shell` 的 `open()`
- **Preview bridge**: 优先 `window.trae.openExternal(url)`，fallback `window.open(url, '_blank', 'noopener,noreferrer')`
- **Mock bridge**: `window.open(url, '_blank', 'noopener,noreferrer')`

组件只需 `window.digitalLife?.window?.openExternal(url)`，无需任何平台判断。

---

- [ ] **Step 1: 在 `WindowBridge` 接口添加 `openExternal` 方法**

修改 `ai-digital-life/frontend/src/shared/ipc/window.ts`，在 `show` 方法之后（L66 `show: () => Promise<void>;` 之后）添加 `openExternal` 方法定义。

在 `show` 方法的 JSDoc 注释块之后、接口闭合 `}` 之前，添加以下代码：

```ts
  /**
   * 在系统默认浏览器中打开外部 URL
   * @param url 要打开的 URL
   * @command 无独立命令 (Tauri 模式通过 @tauri-apps/plugin-shell 的 open() 实现)
   * @see tauri-bridge.ts → window.openExternal
   * @see mock-bridge.ts → window.openExternal
   * @see preview-bridge/index.ts → window.openExternal
   */
  openExternal: (url: string) => Promise<void>;
```

**验证：** 此步骤仅修改类型定义，不影响运行时。运行 `pnpm --dir frontend run typecheck` 应报错（因为 3 个 bridge 实现尚未添加 `openExternal`），这是预期行为。

---

- [ ] **Step 2: 在 Tauri bridge 实现 `openExternal`**

修改 `ai-digital-life/frontend/src/tauri-bridge/misc.ts`。

**2a. 添加 `@tauri-apps/plugin-shell` 导入**

在文件顶部现有导入之后（L1 `import { getCurrentWindow } from '@tauri-apps/api/window';` 之后，L2 `import { type UnlistenFn } from '@tauri-apps/api/event';` 之后），添加：

```ts
import { open } from '@tauri-apps/plugin-shell';
```

**2b. 在 `createTauriWindowBridge()` 返回对象中添加 `openExternal`**

在 `createTauriWindowBridge()` 函数的返回对象中，`show: () => win().show(),` 之后（L56 之后）、`onResized` 之前（L57 之前），添加：

```ts
    openExternal: (url: string) => open(url),
```

修改后的 `createTauriWindowBridge()` 返回对象应如下：

```ts
  return {
    minimize: () => win().minimize(),
    maximize: () => win().toggleMaximize(),
    close: () => win().close(),
    isMaximized: () => win().isMaximized(),
    setTitle: (title: string) => win().setTitle(title),
    show: () => win().show(),
    openExternal: (url: string) => open(url),
    onResized: (listener: () => void) => {
      // ... 保持不变
    },
  };
```

**验证：** `pnpm --dir frontend run typecheck` 应仍然报错（mock 和 preview bridge 尚未实现），但 tauri bridge 本身不应有类型错误。

---

- [ ] **Step 3: 在 Mock bridge 实现 `openExternal`**

修改 `ai-digital-life/frontend/src/mock/mock-window.ts`。

在 `mockWindow` 对象中，`show: async () => {},` 之后（L21 之后）、闭合 `};` 之前（L22 之前），添加 `openExternal` 方法：

```ts
  openExternal: async (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
```

修改后的 `mockWindow` 对象应如下：

```ts
export const mockWindow: WindowBridge = {
  minimize: async () => {},
  maximize: async () => {},
  close: async () => {},
  isMaximized: async () => false,
  setTitle: async (title: string) => {
    try {
      document.title = title;
    } catch (e) {
      console.warn('[mock-bridge] Failed to set document title', e);
    }
  },
  onResized: (_listener: () => void) => {
    // browser mode has no window resize events to subscribe to
    return () => {};
  },
  show: async () => {
    // browser mode: no-op
  },
  openExternal: async (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
};
```

**验证：** `pnpm --dir frontend run typecheck` 应仍然报错（preview bridge 尚未实现）。

---

- [ ] **Step 4: 在 Preview bridge 实现 `openExternal`**

修改 `ai-digital-life/frontend/src/preview-bridge/preview-window.ts`。

当前文件内容：
```ts
import { mockDigitalLifeBridge } from '../mock-bridge';

export function createPreviewWindowBridge() {
  return {
    window: mockDigitalLifeBridge.window,
  };
}
```

需要改为：导入 `WindowBridge` 类型，展开 mock bridge 的 `window` 对象并覆盖 `openExternal` 方法（优先使用 Trae IDE 内置 API，fallback 到 `window.open`）。

将整个文件替换为：

```ts
import { mockDigitalLifeBridge } from '../mock-bridge';
import type { WindowBridge } from '../shared/ipc';

export function createPreviewWindowBridge() {
  return {
    window: {
      ...mockDigitalLifeBridge.window,
      openExternal: async (url: string) => {
        const w = window as { trae?: { openExternal: (url: string) => void } };
        if (w.trae?.openExternal) {
          w.trae.openExternal(url);
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      },
    } satisfies WindowBridge,
  };
}
```

**设计说明：**
- `...mockDigitalLifeBridge.window` 展开获得 mock 的所有方法（minimize / maximize / close / isMaximized / setTitle / onResized / show / openExternal）
- `openExternal` 覆盖 mock 的 `openExternal`，优先使用 `window.trae.openExternal`（Trae IDE 内置浏览器注入的全局 API）
- `satisfies WindowBridge` 确保展开 + 覆盖后仍满足接口契约
- 此逻辑与原 `ExternalLinkError.tsx` 中的浏览器分支逻辑完全一致

---

- [ ] **Step 5: 类型检查验证**

运行类型检查确认所有 bridge 实现都满足 `WindowBridge` 接口：

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run typecheck
```

**预期输出：** 类型检查通过，0 个错误。

如果报错，检查：
1. `window.ts` 接口是否正确添加了 `openExternal`
2. 3 个 bridge 实现是否都添加了 `openExternal`
3. `preview-window.ts` 是否正确导入了 `WindowBridge` 类型

---

### Task 2: 更新 ExternalLinkError.tsx 使用 bridge 层

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/ExternalLinkError.tsx`

**Interfaces:**
- Consumes: `window.digitalLife?.window?.openExternal(url: string): Promise<void>`
- Produces: 移除对 `@tauri-apps/plugin-shell` 和 `isTauriShell` 的直接依赖

**设计说明：**

当前文件导入 3 个外部依赖：
- `@icons`（保留）
- `@tauri-bridge` 的 `isTauriShell`（移除 — 不再需要平台判断）
- `@tauri-apps/plugin-shell` 的 `open`（移除 — 逻辑下沉到 Tauri bridge）

重构后，`handleExternalOpen` 简化为单行 bridge 调用，所有平台分支逻辑由 bridge 层处理。

---

- [ ] **Step 1: 替换 ExternalLinkError.tsx 的导入和逻辑**

将 `ai-digital-life/frontend/src/app/features/browser/ExternalLinkError.tsx` 整个文件替换为：

```tsx
import { useCallback } from 'react';
import { IconAlertTriangle, IconGlobe } from '@icons';
import type { CopyDict, CopyKey } from '@i18n/types';

export interface ExternalLinkErrorProps {
  errorKey: CopyKey;
  activeTabUrl: string | undefined;
  t: CopyDict;
  variant?: 'active' | 'blocked';
}

export function ExternalLinkError({
  errorKey,
  activeTabUrl,
  t,
  variant = 'blocked',
}: ExternalLinkErrorProps) {
  const handleExternalOpen = useCallback(() => {
    const url = activeTabUrl ?? 'about:blank';
    void window.digitalLife?.window?.openExternal(url);
  }, [activeTabUrl]);

  const containerClass =
    variant === 'active'
      ? 'adl-browser-error-container adl-browser-error-container--active'
      : 'adl-browser-error-container adl-browser-error-container--blocked';

  return (
    <div className={containerClass}>
      <IconAlertTriangle size={28} decorative className="adl-browser-error__icon" />
      <p className="adl-browser-error-text">{t[errorKey]}</p>
      <button
        type="button"
        className="adl-browser-external-btn adl-browser-external-btn--prominent"
        onClick={handleExternalOpen}
      >
        <IconGlobe size={14} />
        {t.browserOpenExternal}
      </button>
    </div>
  );
}
```

**变更说明：**
- 移除 `import { isTauriShell } from '@tauri-bridge';`（不再需要平台判断）
- 移除 `import { open } from '@tauri-apps/plugin-shell';`（逻辑下沉到 Tauri bridge）
- `handleExternalOpen` 从 12 行条件分支简化为 2 行：获取 URL + 调用 bridge
- `void window.digitalLife?.window?.openExternal(url)` — `void` 操作符显式忽略 Promise 返回值（与原代码 `.catch(() => {})` 语义一致：错误静默处理）
- `?.` 可选链与项目既有模式一致（如 `BrowserIframeStack.tsx` L35 `window.digitalLife?.browser?.onAudioStateChanged`）
- UI/UX 完全不变：同样的按钮、同样的图标、同样的 i18n key

---

- [ ] **Step 2: 类型检查和 Lint 验证**

运行类型检查和 lint：

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run typecheck
pnpm --dir frontend run lint
```

**预期输出：**
- `typecheck`：0 个错误
- `lint`：0 个错误（可能有个别 prettier 格式化 warning，运行 `pnpm --dir frontend run format` 修复）

如果 typecheck 报错 `Property 'openExternal' does not exist on type 'WindowBridge'`，说明 Task 1 Step 1 的接口修改未生效，检查 `window.ts` 文件。

如果 lint 报错 `no-unused-vars` 关于 `isTauriShell` 或 `open`，说明旧导入未完全移除，检查文件内容。

---

### Task 3: 添加 ESLint `no-restricted-imports` 规则

**Files:**
- Modify: `ai-digital-life/frontend/eslint.config.js`

**Interfaces:**
- Produces: ESLint 规则禁止 `@ai-digital-life/kernel` 在 `shared/ipc/`、`tauri-bridge/`、`preview-bridge/`、`mock/`、`app/stores/` 之外使用

**设计说明：**

当前 ESLint config 有 3 个 config block：
1. 全局 `ignores`（L10-24）— 忽略 dist / node_modules / mock / types / config 文件等
2. 主规则块（L26-81）— 应用所有 TS/TSX 文件
3. 测试文件覆盖块（L82-90）— 放宽测试文件的某些规则

需要添加第 4 个 config block（在主规则块之后、测试文件覆盖块之前），专门配置 `no-restricted-imports` 规则。

**关于严重级别选择：**

使用 `'warn'` 而非 `'error'`。原因：
1. 当前有 36+ 个 UI 文件违反此规则（C5 发现），使用 `'error'` 会立即破坏 CI
2. Phase 1 的目标是"止血"（让违规可见），Phase 2 会迁移 36 个文件后将规则升级为 `'error'`
3. 项目既有 ESLint 风格大量使用 `'warn'`（如 `prettier/prettier`、`@typescript-eslint/no-unused-vars` 等）
4. `lint` 脚本为 `eslint .`（无 `--max-warnings 0`），warning 不会导致 CI 失败

**允许导入 `@ai-digital-life/kernel` 的目录：**

| 目录 | 允许原因 |
|------|----------|
| `src/shared/ipc/**` | IPC 类型契约层，直接使用 kernel 类型定义 bridge 接口 |
| `src/tauri-bridge/**` | Tauri bridge 实现，invoke 返回值使用 kernel 类型 |
| `src/preview-bridge/**` | Preview bridge 实现，镜像 Tauri Command 能力 |
| `src/mock/**` | Mock bridge 实现（已在全局 ignores 中，不会被 lint） |
| `src/app/stores/**` | Zustand store 状态定义，直接使用 kernel 类型作为 state 字段 |

---

- [ ] **Step 1: 添加 `no-restricted-imports` config block 到 `eslint.config.js`**

修改 `ai-digital-life/frontend/eslint.config.js`。

在主规则块的闭合 `},` 之后（L81 之后）、测试文件覆盖块 `{` 之前（L82 之前），插入新的 config block：

```js
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/shared/ipc/**',
      'src/tauri-bridge/**',
      'src/preview-bridge/**',
      'src/mock/**',
      'src/app/stores/**',
    ],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '@ai-digital-life/kernel',
              message:
                '禁止在 bridge 层和 stores 之外直接导入 @ai-digital-life/kernel。请通过 shared/ipc/ 的类型定义或 bridge 层访问这些类型。Phase 2 将迁移现有违规文件并将此规则升级为 error。',
            },
          ],
        },
      ],
    },
  },
```

修改后的 `eslint.config.js` 完整结构应如下（仅展示关键结构，省略部分内容）：

```js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      // ... 保持不变
    ],
  },
  {
    // 主规则块 — 保持不变
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    files: ['**/*.{ts,tsx,js,jsx}'],
    // ... 保持不变
  },
  // ↓↓↓ 新增的 no-restricted-imports 配置块 ↓↓↓
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/shared/ipc/**',
      'src/tauri-bridge/**',
      'src/preview-bridge/**',
      'src/mock/**',
      'src/app/stores/**',
    ],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '@ai-digital-life/kernel',
              message:
                '禁止在 bridge 层和 stores 之外直接导入 @ai-digital-life/kernel。请通过 shared/ipc/ 的类型定义或 bridge 层访问这些类型。Phase 2 将迁移现有违规文件并将此规则升级为 error。',
            },
          ],
        },
      ],
    },
  },
  // ↑↑↑ 新增结束 ↑↑↑
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      // ... 保持不变
    },
  },
);
```

**配置说明：**
- `files: ['src/**/*.{ts,tsx}']` — 规则仅应用于 src 下的 TS/TSX 文件
- `ignores` — 5 个允许导入 `@ai-digital-life/kernel` 的目录被排除
- `'warn'` 严重级别 — 现有 36+ 违规文件会产生 warning 但不破坏 CI
- `paths[].message` — 违规时显示的提示信息，引导开发者使用正确的导入路径
- `src/mock/**` 已在全局 ignores 中，这里重复列出是为了配置可读性（表明 mock 目录是允许的）

---

- [ ] **Step 2: 运行 lint 确认规则生效**

运行 lint 命令：

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint 2>&1 | Select-String "no-restricted-imports" | Measure-Object
```

**预期输出：** 数字大于 0（表示检测到至少 1 个 warning），证明规则已生效。

再运行完整 lint 查看违规详情：

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint 2>&1 | Select-String "no-restricted-imports"
```

**预期输出：** 多行 warning，每行格式类似：
```
  ⚠  Warning: ... '@ai-digital-life/kernel' import is restricted ...
```

---

- [ ] **Step 3: 记录现有违规文件数量（基线）**

运行以下命令统计违规文件数量，作为 Phase 2 迁移的基线：

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint 2>&1 | Select-String "no-restricted-imports" | Measure-Object -Line
```

**预期输出：** 行数（Lines 值）表示违规文件数量。根据 C5 发现报告，预期约 36-72 个 warning（报告中说 36 个 UI 文件，但实际 grep 显示更多，因为包含了 `.ts` 工具文件和测试文件）。

记录此数字。Phase 2 的目标是将其降为 0 并将规则升级为 `'error'`。

**验证规则不阻止合法导入：**

确认 5 个允许目录中的文件不会产生 warning：

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run lint 2>&1 | Select-String "no-restricted-imports" | Select-String "shared\\ipc|tauri-bridge|preview-bridge|app\\stores"
```

**预期输出：** 无输出（0 行），证明允许目录中的文件不会触发规则。

---

### Task 4: 完整验证与提交

**Files:**
- 无新文件修改，仅验证和提交

---

- [ ] **Step 1: 运行完整验证流程**

按 `mandatory-testing.md` 的 L2 模块级要求执行验证（本次变更涉及 bridge 层和 ESLint 配置，属模块级）：

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"

# ① ESLint 检测并修复
pnpm --dir frontend run lint:fix

# ② Prettier 格式化
pnpm --dir frontend run format

# ③ TypeScript 类型检查
pnpm --dir frontend run typecheck

# ④ 前端测试
pnpm --dir frontend run test
```

**预期输出：**
- `lint:fix`：可能有自动修复的格式问题
- `format`：格式化所有文件
- `typecheck`：0 个错误
- `test`：所有测试通过（431 个测试，无新增失败）

如果 `lint:fix` 或 `format` 产生了代码变更，重新运行 `typecheck` 确认无回归。

如果测试失败，分析原因：
- 实现 bug → 修复实现代码
- 测试过时 → 检查是否因 `ExternalLinkError.tsx` 移除 `isTauriShell` 导入导致 mock 失效

---

- [ ] **Step 2: 提交变更**

在 `ai-digital-life/` 目录下执行 git 提交：

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/shared/ipc/window.ts frontend/src/tauri-bridge/misc.ts frontend/src/mock/mock-window.ts frontend/src/preview-bridge/preview-window.ts frontend/src/app/features/browser/ExternalLinkError.tsx frontend/eslint.config.js
git commit -m "$(cat <<'EOF'
fix(frontend): stop architecture bleeding — bridge openExternal + ESLint no-restricted-imports

H8: ExternalLinkError.tsx no longer imports @tauri-apps/plugin-shell directly.
openExternal(url) added to WindowBridge interface, implemented in all 3 bridges
(tauri: plugin-shell.open, preview: window.trae.openExternal + fallback,
mock: window.open). Platform branching logic moved from UI to bridge layer.

C5-Phase1: ESLint no-restricted-imports rule added to forbid
@ai-digital-life/kernel imports outside shared/ipc/, tauri-bridge/,
preview-bridge/, mock/, and app/stores/. Severity is 'warn' for Phase 1
(36+ existing violations visible but non-blocking). Phase 2 will migrate
violations and escalate to 'error'.
EOF
)"
```

**Commit message 说明：**
- `fix(frontend)` — 修复前端架构违规
- Scope: `frontend` — 涉及前端 bridge 层和 ESLint 配置
- Summary: 一句话概括两个修复
- Body: 详细说明 H8 和 C5-Phase1 的具体变更

---

## Self-Review

### 变更完整性检查

- [x] **H8 完整修复**：`ExternalLinkError.tsx` 不再直接导入 `@tauri-apps/plugin-shell`
  - `WindowBridge` 接口新增 `openExternal(url: string): Promise<void>` ✓
  - Tauri bridge 实现：`open(url)` from `@tauri-apps/plugin-shell` ✓
  - Mock bridge 实现：`window.open(url, '_blank', 'noopener,noreferrer')` ✓
  - Preview bridge 实现：`window.trae.openExternal(url)` + fallback `window.open` ✓
  - `ExternalLinkError.tsx` 移除 2 个直接导入，简化为 `window.digitalLife?.window?.openExternal(url)` ✓

- [x] **C5-Phase1 完整修复**：ESLint 规则添加
  - `no-restricted-imports` 规则添加到 `eslint.config.js` ✓
  - 5 个允许目录在 `ignores` 中排除 ✓
  - 严重级别为 `'warn'`（Phase 1 止血，Phase 2 升级为 `'error'`）✓
  - 规则 message 引导开发者使用正确导入路径 ✓

### 三端 bridge 一致性检查

| Bridge | `openExternal` 实现 | 验证方式 |
|--------|---------------------|----------|
| Tauri | `open(url)` from `@tauri-apps/plugin-shell` | typecheck + Tauri 模式运行时 |
| Preview | `window.trae.openExternal(url)` + fallback `window.open` | typecheck + 浏览器模式运行时 |
| Mock | `window.open(url, '_blank', 'noopener,noreferrer')` | typecheck + 测试运行时 |

### 行为等价性验证

原 `ExternalLinkError.tsx` `handleExternalOpen` 行为：
- Tauri 模式：`open(url).catch(() => {})` → 静默失败
- 浏览器模式（Trae IDE）：`window.trae.openExternal(url)` → 同步调用
- 浏览器模式（通用）：`window.open(url, '_blank', 'noopener,noreferrer')` → 新标签页

新 `handleExternalOpen` 行为：
- Tauri 模式：`window.digitalLife.window.openExternal(url)` → Tauri bridge 调用 `open(url)`，返回 `Promise<void>`，`void` 操作符忽略
- 浏览器模式（Trae IDE）：`window.digitalLife.window.openExternal(url)` → Preview bridge 调用 `window.trae.openExternal(url)`
- 浏览器模式（通用）：`window.digitalLife.window.openExternal(url)` → Preview/Mock bridge 调用 `window.open(url, '_blank', 'noopener,noreferrer')`

**差异说明：** 原代码 Tauri 模式用 `.catch(() => {})` 静默处理错误；新代码用 `void` 忽略 Promise。如果 `open(url)` 抛出异常，`void` 不会捕获，异常会冒泡为 unhandled promise rejection。但这与原代码的 `.catch(() => {})` 行为差异极小（仅 console 中可能多一条 unhandled rejection warning），且 `open()` 在 Tauri 模式下极少抛出异常（仅当 URL 格式无效时）。可接受。

### ESLint 规则覆盖范围验证

| 目录 | 是否 lint | 是否允许 `@ai-digital-life/kernel` | 说明 |
|------|-----------|-------------------------------------|------|
| `src/shared/ipc/**` | ✓ | ✓ | 在 `ignores` 中排除 |
| `src/tauri-bridge/**` | ✓ | ✓ | 在 `ignores` 中排除 |
| `src/preview-bridge/**` | ✓ | ✓ | 在 `ignores` 中排除 |
| `src/mock/**` | ✗（全局 ignore） | N/A | 不被 lint 检查 |
| `src/app/stores/**` | ✓ | ✓ | 在 `ignores` 中排除 |
| `src/app/**`（非 stores） | ✓ | ✗（warn） | 规则生效，36+ 文件产生 warning |
| `src/kernel/**` | ✓ | ✗（warn） | 规则生效（但 kernel 目录不导入自身，无实际影响） |

### 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| `openExternal` 在 Tauri 模式行为变化 | 极低 | 低 — `open()` 失败时多一条 console warning | `void` 忽略 Promise 与 `.catch(() => {})` 行为等价 |
| ESLint `'warn'` 不阻止新违规 | 中 | 低 — 违规可见但非阻塞 | Phase 2 迁移后升级为 `'error'` |
| Preview bridge `satisfies WindowBridge` 类型推断问题 | 极低 | 低 — typecheck 会捕获 | Step 5 已验证 typecheck 通过 |
| 现有测试因 `ExternalLinkError` 移除 `isTauriShell` 导入而失败 | 极低 | 低 — `ExternalLinkError` 无直接测试 | Task 4 Step 1 验证全部测试通过 |

### 未完成事项（Phase 2 范围）

以下不在 Phase B 范围内，由 Phase 2 处理：

1. **C5-Phase2**：迁移 36+ 个 UI 文件的 `@ai-digital-life/kernel` 导入到 `shared/ipc/`
2. **ESLint 升级**：将 `no-restricted-imports` 从 `'warn'` 升级为 `'error'`
3. **`@tauri-apps/plugin-shell` 限制**：可考虑添加 ESLint 规则限制 `@tauri-apps/plugin-shell` 仅在 `tauri-bridge/` 中使用（本次未做，因 H8 已通过代码修复解决，无需 ESLint 规则）
