# Plan E: 系统性架构债务清理实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理系统性扫描发现的 15 项架构债务——移除死代码 trait、修复类型错误处理、消除前端重复模式、解决残留的技术债务。

**Architecture:** 本计划覆盖 4 个独立子系统：Rust 死代码清理（无真实实现的 trait 系统）、TypeScript 错误处理加固（空 catch 块）、前端重复模式消除（useClickOutside 共享 hook + 无用的 React import）、以及残留技术债务（未使用的参数、孤立的工具函数、isTauriShell 导入规范）。各子系统互不依赖，可并行执行。

**前置依赖:** 已有的 Plan A (前端编译修复)、Plan B (Rust 异步 IO + compaction)、Plan C (Storage 依赖倒置)、Plan D (代码质量扫描) 应已执行或同时执行。本计划覆盖这些计划未涉及的系统性扫描发现。

**Tech Stack:** Rust 2021, TypeScript 5.6 + React 19, Zustand 5

## 全局约束

- Rust 生产代码禁止 `unwrap()`，必须用 `?` 或模式匹配
- Rust 生产代码禁止 `panic!`（测试代码除外）
- TypeScript 空 catch 块至少需要 `console.warn` 记录错误
- TypeScript `catch (e) {}` 中的 `e` 不能未使用（必须在块内引用）
- `import React` 仅在使用 React API（`useState`、`useEffect` 等）时才保留
- 所有测试必须通过：`cargo test --workspace` + `pnpm run frontend:test`
- Clippy 零警告：`cargo clippy --workspace --all-targets`
- 遵循 `rustfmt.toml`（max_width=100, tab_spaces=4, Unix 换行）
- 前端 lint 零警告：`pnpm run frontend:lint`
- TypeScript 类型检查通过：`pnpm run frontend:typecheck`

---

## 任务概览

| 任务 | 优先级 | 子系统 | 预估文件数 |
|------|--------|--------|-----------|
| 1. 移除死代码 Plugin trait 系统 | Critical | Rust (agent-runtime) | 6 |
| 2. 移除死代码 PtyEventEmitter trait | Critical | Rust (pty) | 2 |
| 3. 修复 8 个空 catch 块 | High | TypeScript (6 文件) | 6 |
| 4. 提取 useClickOutside 共享 hook | Medium | TypeScript (新建 + 4 组件) | 5 |
| 5. 移除 131 个无用的 React import | Low | TypeScript (批量 codemod) | 131 |
| 6. 移走 run_activity_seq.rs 到库 crate | Low | Rust (src-tauri → agent-runtime) | 3 |
| 7. 删除未使用的 _fork_message_id 参数 | Low | Rust (conversation) | 1 |
| 8. 规范 isTauriShell 导入方式 | Low | TypeScript (22 文件) | 22 |

---

### Task 1: 移除死代码 Plugin trait 系统

**说明:** `crates/agent-runtime/src/plugins/` 定义了完整的 Plugin trait（`on_hook()` 方法 + 7 个 `HookType` 变体 + registry + hooks 分发），但 0 个真实实现——所有 5 个 impl 仅在测试代码中。整个子系统是死代码。

**Files:**
- 删除: `crates/agent-runtime/src/plugins/mod.rs`
- 删除: `crates/agent-runtime/src/plugins/registry.rs`
- 删除: `crates/agent-runtime/src/plugins/hooks.rs`（如果存在）
- 修改: `crates/agent-runtime/src/lib.rs` — 移除 `pub mod plugins` 和所有 `plugin` 引用
- 修改: `crates/agent-runtime/Cargo.toml` — 移除非必要的插件依赖（如果有）
- 删除: `crates/agent-runtime/src/plugins/` 目录
- 测试: `cargo test --workspace -p adl-agent-runtime`

- [ ] **Step 1: 确认 plugins 目录结构**

```bash
Get-ChildItem -Recurse "crates/agent-runtime/src/plugins/"
```

Expected: 显示 plugins/mod.rs, plugins/registry.rs, plugins/hooks.rs 等文件

- [ ] **Step 2: 编写测试—编译验证当前 plugins 被引用**

```bash
cd ai-digital-life
cargo check --workspace -p adl-agent-runtime 2>&1
```

Expected: 编译成功，0 警告

- [ ] **Step 3: 读取 lib.rs 找到 plugins 的引用**

```bash
Select-String -Path "crates/agent-runtime/src/lib.rs" -Pattern "plugin|Plugin"
```

Expected: 显示 `pub mod plugins;` 以及可能的 `pub use plugins::...` 或 `mod plugins`（如果是私有）

- [ ] **Step 4: 读取 plugins 目录各文件确认全部是死代码**

```bash
Get-ChildItem -Recurse "crates/agent-runtime/src/plugins/" | ForEach-Object { "=== $($_.Name) ==="; Get-Content $_.FullName -Raw }
```

- [ ] **Step 5: 删除 plugins 目录**

```bash
Remove-Item -Recurse -Force "crates/agent-runtime/src/plugins/"
```

- [ ] **Step 6: 从 lib.rs 移除 plugins 引用**

编辑 `crates/agent-runtime/src/lib.rs`，删除：
```rust
pub mod plugins;
```
以及任何 `pub use plugins::...`、`use crate::plugins::...` 等引用。

- [ ] **Step 7: 从 Cargo.toml 移除插件相关的额外依赖（如有）**

检查 `crates/agent-runtime/Cargo.toml` 是否有仅 plugins 使用的依赖。如果没有特别依赖，跳过。

- [ ] **Step 8: 验证编译和测试通过**

```bash
cd ai-digital-life
cargo check --workspace -p adl-agent-runtime 2>&1
cargo test --workspace -p adl-agent-runtime 2>&1
cargo clippy --workspace -p adl-agent-runtime --all-targets -- -D warnings 2>&1
```

Expected: 编译成功，测试通过，clippy 零警告

- [ ] **Step 9: 搜索整个工作区是否有 plugins 的外部引用**

```bash
cd ai-digital-life
Select-String -Path "crates/agent-runtime/src/*.rs" -Pattern "plugins" | Select-Object -Unique
Select-String -Path "src-tauri/src/*.rs" -Pattern "plugins"
```

Expected: 无更多引用（或仅注释引用）

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: remove dead Plugin trait system (0 real implementations)

The entire plugins subsystem (trait + registry + hooks + 7 HookType
variants) had zero real implementations — only 5 test-only impls.
Removed dead code per systematic architecture audit.
If plugins are needed in the future, reintroduce with a validated design."
```

---

### Task 2: 移除死代码 PtyEventEmitter trait

**说明:** `crates/pty/src/session_manager.rs` 中定义了 `PtyEventEmitter` trait（`Send + Sync + 'static`），通过 `Arc<dyn PtyEventEmitter>` 引用，但 0 个实现存在。完全是死代码。

**提示:** 不能直接删除 trait——必须先确认 `Arc<dyn PtyEventEmitter>` 类型如何在 session_manager 中使用，然后用合适的替代方案（如空 struct 或移除字段）。

- [ ] **Step 1: 读取 session_manager.rs 完整内容**

```bash
Get-Content "crates/pty/src/session_manager.rs" -Raw
```

- [ ] **Step 2: 确认 PtyEventEmitter trait 的定义和使用位置**

```rust
// 定位 trait 定义
pub trait PtyEventEmitter: Send + Sync + 'static { ... }

// 定位使用处（通常作为 struct 字段类型）
Arc<dyn PtyEventEmitter>
```

- [ ] **Step 3: 编写测试—编译确认当前引用**

```bash
cd ai-digital-life
cargo check --workspace -p adl-pty 2>&1
```

Expected: 编译成功

- [ ] **Step 4: 修改 session_manager.rs**

方案：如果 `PtyEventEmitter` 是 struct 的字段类型，且仅在初始化时设置但从不调用，则移除该字段和相关代码。

例如，假设代码结构是：
```rust
pub trait PtyEventEmitter: Send + Sync + 'static {}

pub struct PtySessionManager {
    emitter: Option<Arc<dyn PtyEventEmitter>>,
    // ... 其他字段
}

impl PtySessionManager {
    pub fn new(emitter: Option<Arc<dyn PtyEventEmitter>>) -> Self {
        Self { emitter, ... }
    }
}
```

修改为删除 trait、删除 `emitter` 字段、删除构造函数参数：
```rust
pub struct PtySessionManager {
    // ... 其他字段
}

impl PtySessionManager {
    pub fn new() -> Self {
        Self { ... }
    }
}
```

- [ ] **Step 5: 更新所有调用者**

搜索整个工作区中 `PtySessionManager::new(` 的调用处，移除 `emitter` 参数。

```bash
cd ai-digital-life
Select-String -Path "*.rs" -Recurse -Pattern "PtySessionManager::new|PtyEventEmitter"
```

- [ ] **Step 6: 验证编译和测试**

```bash
cd ai-digital-life
cargo check --workspace 2>&1
cargo test --workspace 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
```

Expected: 编译成功，所有测试通过，clippy 零警告

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove dead PtyEventEmitter trait (0 implementations)

The trait was defined, consumed via Arc<dyn PtyEventEmitter> in
PtySessionManager, but had zero real implementations anywhere in
the codebase. Removed per systematic architecture audit."
```

---

### Task 3: 修复 8 个空 catch 块

**说明:** 6 个 TypeScript 文件中有 8 个空 catch 块（`catch {}` 或 `catch (e) {}`），静默吞没所有错误。至少需要 `console.warn` 记录错误信息。

**Files:**
- 修改: `frontend/src/app/components/workspace/WorkspaceSplitButton.tsx` — 3 处（line 127, 326, 340）
- 修改: `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx` — 1 处（line 243）
- 修改: `frontend/src/app/regions/right-panel/panels/FilesPanel.tsx` — 1 处（line 147）
- 修改: `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx` — 1 处（line 183）
- 修改: `frontend/src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx` — 1 处（line 143）
- 修改: `frontend/src/app/regions/right-panel/panels/ChangesPanel/utils.ts` — 1 处（line 21）

- [ ] **Step 1: 确认各文件中的空 catch 块位置**

```bash
cd ai-digital-life\frontend
Select-String -Path "src/**/*.ts" -Pattern "catch\s*(\(?\s*\w*\s*\)?)?\s*\{\s*\}"
Select-String -Path "src/**/*.tsx" -Pattern "catch\s*(\(?\s*\w*\s*\)?)?\s*\{\s*\}"
```

- [ ] **Step 2: 逐文件读取确认上下文**

```bash
Get-Content "src/app/components/workspace/WorkspaceSplitButton.tsx" | Select-Object -Index (125..130)
Get-Content "src/app/components/workspace/WorkspaceSplitButton.tsx" | Select-Object -Index (324..329)
Get-Content "src/app/components/workspace/WorkspaceSplitButton.tsx" | Select-Object -Index (338..343)
Get-Content "src/app/regions/right-panel/FileNavigatorShell.tsx" | Select-Object -Index (241..246)
Get-Content "src/app/regions/right-panel/panels/FilesPanel.tsx" | Select-Object -Index (145..150)
Get-Content "src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx" | Select-Object -Index (181..186)
Get-Content "src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx" | Select-Object -Index (141..146)
Get-Content "src/app/regions/right-panel/panels/ChangesPanel/utils.ts" | Select-Object -Index (19..24)
```

- [ ] **Step 3: 修改 WorkspaceSplitButton.tsx（第 1 处，line 127）**

将 `catch { }` 替换为带日志的 catch：

```typescript
} catch {
  console.warn('[WorkspaceSplitButton] failed to find workspace file group');
}
```

- [ ] **Step 4: 修改 WorkspaceSplitButton.tsx（第 2 处，line 326）**

将 `catch {}` 替换为：

```typescript
} catch {
  console.warn('[WorkspaceSplitButton] failed to render');
}
```

- [ ] **Step 5: 修改 WorkspaceSplitButton.tsx（第 3 处，line 340）**

将 `catch {}` 替换为：

```typescript
} catch {
  console.warn('[WorkspaceSplitButton] failed to render');
}
```

- [ ] **Step 6: 修改 FileNavigatorShell.tsx（line 243）**

将 `catch (e) {}` 替换为带参数引用的 catch（满足 lint 规则）或忽略参数：

```typescript
} catch {
  console.warn('[FileNavigatorShell] operation failed');
}
```

- [ ] **Step 7: 修改 FilesPanel.tsx（line 147）**

检查上下文，添加合适的 warn：

```typescript
} catch {
  console.warn('[FilesPanel] operation failed');
}
```

- [ ] **Step 8: 修改 WorkspaceChangesEntry.tsx（line 183）**

```typescript
} catch {
  console.warn('[WorkspaceChangesEntry] operation failed');
}
```

- [ ] **Step 9: 修改 WorkspaceFileTreeEntry.tsx（line 143）**

```typescript
} catch {
  console.warn('[WorkspaceFileTreeEntry] operation failed');
}
```

- [ ] **Step 10: 修改 ChangesPanel/utils.ts（line 21）**

```typescript
} catch {
  console.warn('[ChangesPanel] failed to process changes');
}
```

- [ ] **Step 11: 验证 lint 和测试**

```bash
cd ai-digital-life\frontend
pnpm run lint 2>&1
pnpm run typecheck 2>&1
pnpm run test 2>&1
```

Expected: lint 零警告，类型检查通过，测试通过

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "fix: add console.warn to 8 empty catch blocks across 6 files

Silent catch blocks swallow errors with no logging, making
production debugging difficult. Added at minimum console.warn
with component context to each catch block."
```

---

### Task 4: 提取 useClickOutside 共享 hook

**说明:** 4+ 个组件各自独立实现「点击外部关闭」+「Escape 键关闭」模式——每个约 40 行 `useEffect` + `addEventListener('mousedown', ...)` + `addEventListener('keydown', ...Escape)` 的重复代码。提取为共享 `useClickOutside` hook。

**Files:**
- 创建: `frontend/src/app/hooks/useClickOutside.ts`
- 修改: `frontend/src/app/hooks/index.ts`（添加导出）
- 修改: `frontend/src/app/regions/TitleBar.tsx` — 替换内联实现
- 修改: `frontend/src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx` — 替换内联实现
- 修改: `frontend/src/app/components/conversation/ContextBuilder.tsx` — 替换内联实现

> **注意：** BrowserPanelContent.tsx 也需要确认是否也有此模式——如果存在一并替换。

- [ ] **Step 1: 编写 useClickOutside hook 测试**

```typescript
// frontend/src/app/hooks/__tests__/useClickOutside.test.ts
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useClickOutside } from '../useClickOutside';

describe('useClickOutside', () => {
  it('calls onOutsideClick when mousedown occurs outside ref element', () => {
    const ref = { current: document.createElement('div') };
    const onOutsideClick = vi.fn();
    const onEscape = vi.fn();

    renderHook(() => useClickOutside(ref, true, { onOutsideClick, onEscape }));

    const event = new MouseEvent('mousedown', { bubbles: true });
    document.dispatchEvent(event);

    expect(onOutsideClick).toHaveBeenCalled();
  });

  it('does not call onOutsideClick when clicking inside ref element', () => {
    const ref = { current: document.createElement('div') };
    const onOutsideClick = vi.fn();

    renderHook(() => useClickOutside(ref, true, { onOutsideClick }));

    const event = new MouseEvent('mousedown', { bubbles: true });
    ref.current.dispatchEvent(event);

    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it('calls onEscape when Escape key is pressed', () => {
    const ref = { current: document.createElement('div') };
    const onEscape = vi.fn();

    renderHook(() => useClickOutside(ref, true, { onEscape }));

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    expect(onEscape).toHaveBeenCalled();
  });

  it('does not call callbacks when enabled is false', () => {
    const ref = { current: document.createElement('div') };
    const onOutsideClick = vi.fn();
    const onEscape = vi.fn();

    renderHook(() => useClickOutside(ref, false, { onOutsideClick, onEscape }));

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onOutsideClick).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd ai-digital-life\frontend
pnpm run test -- src/app/hooks/__tests__/useClickOutside.test.ts 2>&1
```

Expected: 失败（模块未找到）

- [ ] **Step 3: 实现 useClickOutside hook**

```typescript
// frontend/src/app/hooks/useClickOutside.ts
import { useEffect, type RefObject } from 'react';

interface UseClickOutsideOptions {
  onOutsideClick?: () => void;
  onEscape?: () => void;
}

export function useClickOutside(
  ref: RefObject<Element | null>,
  enabled: boolean,
  { onOutsideClick, onEscape }: UseClickOutsideOptions,
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutsideClick?.();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape?.();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, enabled, onOutsideClick, onEscape]);
}
```

- [ ] **Step 4: 从 hooks/index.ts 导出**

```typescript
// 在 frontend/src/app/hooks/index.ts 添加
export { useClickOutside } from './useClickOutside';
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd ai-digital-life\frontend
pnpm run test -- src/app/hooks/__tests__/useClickOutside.test.ts 2>&1
```

Expected: 测试通过

- [ ] **Step 6: 搜索 TitleBar.tsx 中的内联点击外部实现**

读取 TitleBar.tsx 中的相关代码段（line ~85-110），找到以下模式：
```typescript
useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => { ... };
  const handleKeyDown = (e: KeyboardEvent) => { ... };
  document.addEventListener('mousedown', handleClickOutside);
  document.addEventListener('keydown', handleKeyDown);
  return () => { ... };
}, [deps]);
```

- [ ] **Step 7: 替换 TitleBar.tsx 中的实现**

删除 40 行内联 `useEffect`，替换为：
```typescript
useClickOutside(notificationRef, showNotifications, {
  onOutsideClick: () => setShowNotifications(false),
  onEscape: () => setShowNotifications(false),
});
```

- [ ] **Step 8: 替换 WorkspaceTerminalEntry.tsx 中的实现**

类似替换，找到 lines 105-141。

- [ ] **Step 9: 替换 ContextBuilder.tsx 中的实现**

确认 ContextBuilder.tsx 中的模式，替换。

- [ ] **Step 10: 确认 BrowserPanelContent.tsx 是否也有此模式**

```bash
cd ai-digital-life\frontend
Select-String -Path "src/app/features/browser/BrowserPanelContent.tsx" -Pattern "mousedown"
```

如果存在，一并替换。

- [ ] **Step 11: 验证 lint、类型检查和测试**

```bash
cd ai-digital-life\frontend
pnpm run lint 2>&1
pnpm run typecheck 2>&1
pnpm run test 2>&1
```

Expected: 全部通过

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(hooks): add useClickOutside shared hook, replace 4+ inline implementations

Extracted the duplicated 'click outside + Escape key' pattern
into a reusable useClickOutside(ref, enabled, { onOutsideClick, onEscape })
hook. Replaced inline implementations in TitleBar, WorkspaceTerminalEntry,
ContextBuilder, and BrowserPanelContent."
```

---

### Task 5: 移除 131 个无用的 React import

**说明:** React 19 的 JSX 转换不需要 `import React`。131 个 `.tsx` 文件导入了 React 但未使用任何 React API（`useState`、`useEffect` 等）。使用 codemod 批量清理。

- [ ] **Step 1: 确认 codemod 可用**

```bash
cd ai-digital-life\frontend
npx react-codemod update-react-imports --help 2>&1 | Select-Object -First 20
```

如果 codemod 不可用，使用 grep + sed 方案。

- [ ] **Step 2a: 如果 codemod 可用——运行 codemod（dry-run）**

```bash
cd ai-digital-life\frontend
npx react-codemod update-react-imports --dry src/ 2>&1
```

- [ ] **Step 2b: 如果 codemod 不可用——手动方案**

使用 grep 找到所有无用的 `import React`：
```bash
cd ai-digital-life\frontend
# 找到所有包含 import React 但不使用 React API 的文件
# 正则: import React 后没有 FROM, 且文件中没有 React.xxx 使用
python -c "
import os, re
count = 0
for root, dirs, files in os.walk('src'):
    if 'node_modules' in root: continue
    for f in files:
        if not f.endswith('.tsx'): continue
        path = os.path.join(root, f)
        content = open(path).read()
        if 'import React' in content and 'from' not in content:
            # 检查是否使用了 React API
            has_react_api = bool(re.search(r'React\.(useState|useEffect|useRef|useCallback|useMemo|createContext|useContext|createElement|Fragment|memo|forwardRef|StrictMode|Suspense|lazy|useReducer|useImperativeHandle|useLayoutEffect|useDebugValue)', content))
            if not has_react_api:
                print(path)
                count += 1
print(f'Total: {count}')
"
```

- [ ] **Step 3: 执行批量删除**

```bash
cd ai-digital-life\frontend
# 对于每个无用的 import React，删除 `import React` 行
# 使用 sed 或用 Node.js 脚本
node -e "
const fs = require('fs');
const glob = require('fs').globSync || require('glob').sync;
const files = // 从上一步获取的列表
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf-8');
  content = content.replace(/^import React\s*;\s*\n?/gm, '');
  fs.writeFileSync(f, content, 'utf-8');
});
"
```

> **注意:** 需要对每个文件单独处理——有些文件是 `import React from 'react';` 格式（bare import），需要确认删除后不影响 API 使用。

实际上更安全的做法是只删除确认为 bare import 且无副作用的情况。对于 `import React from 'react'` 格式，也需要删除。

- [ ] **Step 4: 验证 lint 和类型检查**

```bash
cd ai-digital-life\frontend
pnpm run lint 2>&1
pnpm run typecheck 2>&1
```

Expected: lint 零警告，类型检查通过（注意一些 lint 规则可能因为移除 React import 而触发新的警告，需要逐条处理）

- [ ] **Step 5: 运行测试**

```bash
cd ai-digital-life\frontend
pnpm run test 2>&1
```

Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove 131 unused React imports (React 19 JSX transform)

React 19's JSX transform doesn't require import React. Removed
bare 'import React' statements from files that don't use any
React API (useState, useEffect, etc.)."
```

---

### Task 6: 将 run_activity_seq.rs 移到库 crate

**说明:** `src-tauri/src/run_activity_seq.rs` 包含一个全局原子序列号生成器——纯工具函数，没有任何 Tauri 依赖。它应该放在 `crates/agent-runtime/` 或 `crates/kernel/` 中以便在库测试中可测。

**Files:**
- 移动: `src-tauri/src/run_activity_seq.rs` → `crates/agent-runtime/src/run_activity_seq.rs`
- 修改: `src-tauri/src/main.rs` — 移除 `mod run_activity_seq;`
- 修改: `src-tauri/Cargo.toml` — 确认不需要添加 agent-runtime 依赖（可能已有）
- 修改: `crates/agent-runtime/src/lib.rs` — 添加 `pub mod run_activity_seq;`
- 修改: `src-tauri/src/commands/` — 将 `crate::run_activity_seq` 引用改为 `adl_agent_runtime::run_activity_seq`

- [ ] **Step 1: 读取 run_activity_seq.rs 确认接口**

```bash
Get-Content "src-tauri/src/run_activity_seq.rs" -Raw
```

- [ ] **Step 2: 确认引用方**

```bash
cd ai-digital-life
Select-String -Path "src-tauri/src/**/*.rs" -Pattern "run_activity_seq"
```

Expected: 显示 `mod run_activity_seq;` 和 `crate::run_activity_seq::...` 引用

- [ ] **Step 3: 将文件移动到 agent-runtime**

```bash
Copy-Item "src-tauri/src/run_activity_seq.rs" "crates/agent-runtime/src/run_activity_seq.rs"
Remove-Item "src-tauri/src/run_activity_seq.rs"
```

- [ ] **Step 4: 修改 agent-runtime/src/lib.rs**

添加 `pub mod run_activity_seq;`

- [ ] **Step 5: 修改 src-tauri/src/main.rs**

删除 `mod run_activity_seq;` 行

- [ ] **Step 6: 更新所有引用**

将所有 `crate::run_activity_seq::next_run_activity_seq` 替换为 `adl_agent_runtime::run_activity_seq::next_run_activity_seq`。

如果引用在 agent-runtime 内部（例如其他模块），则简化为 `crate::run_activity_seq::...`。

- [ ] **Step 7: 检查 src-tauri Cargo.toml 是否已有 agent-runtime 依赖**

```bash
Select-String -Path "src-tauri/Cargo.toml" -Pattern "agent-runtime"
```

Expected: `adl-agent-runtime = { path = "../crates/agent-runtime" }`（通常已有——作为 20+ 个依赖之一）

- [ ] **Step 8: 验证编译和测试**

```bash
cd ai-digital-life
cargo check --workspace 2>&1
cargo test --workspace 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
```

Expected: 全部通过

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: move run_activity_seq from binary to agent-runtime crate

The global atomic sequence generator has no Tauri dependency.
Moved to adl-agent-runtime where it's testable from library tests."
```

---

### Task 7: 删除未使用的 `_fork_message_id` 参数

**说明:** `crates/conversation/src/fork.rs:6` 函数签名包含 `_fork_message_id: &str` 参数，但函数体从未引用它。

**Files:**
- 修改: `crates/conversation/src/fork.rs` — 删除参数
- 修改: 所有调用方 — 删除参数

- [ ] **Step 1: 读取 fork.rs 确认函数签名和引用**

```bash
Get-Content "crates/conversation/src/fork.rs" -Raw
```

- [ ] **Step 2: 搜索所有调用方**

```bash
cd ai-digital-life
Select-String -Path "*.rs" -Recurse -Pattern "fork_conversation|fork_session"
```

- [ ] **Step 3: 从 fork.rs 删除参数**

例如从：
```rust
pub fn fork_conversation(
    session: &Session,
    _fork_message_id: &str,
    new_session_id: &SessionId,
) -> ConversationRecord {
```
改为：
```rust
pub fn fork_conversation(
    session: &Session,
    new_session_id: &SessionId,
) -> ConversationRecord {
```

- [ ] **Step 4: 更新所有调用方**

删除传递 `_fork_message_id` 实参的地方。

- [ ] **Step 5: 验证编译和测试**

```bash
cd ai-digital-life
cargo check --workspace 2>&1
cargo test --workspace 2>&1
cargo clippy --workspace --all-targets -- -D warnings 2>&1
```

Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove unused _fork_message_id parameter from fork function"
```

---

### Task 8: 规范 isTauriShell 导入方式

**说明:** 22 个文件直接导入 `isTauriShell` 从 `@tauri-bridge`，绕过 store 抽象。这增加测试 mock 难度。应改为通过 store 暴露环境检测。

**Files:**
- 修改: `frontend/src/app/stores/slices/` — 在相关 slice 中添加 `isTauri` 选择器
- 修改: 22 个文件中的导入

- [ ] **Step 1: 确认所有直接导入位置**

```bash
cd ai-digital-life\frontend
Select-String -Path "src/**/*.{ts,tsx}" -Pattern "from ['\"]@tauri-bridge['\"]|from ['\"](\.\./)+tauri-bridge['\"]"
```

- [ ] **Step 2: 在 store 中添加 isTauri 选择器**

确认是否已有 app/ready 相关状态。在现有的 UI slice 或 app slice 中添加：
```typescript
// 在相关 slice 的 interface 中添加
isTauri: boolean;

// 或者在 selectors.ts 中添加
export const selectIsTauri = (state: StoreState) => state.isTauri;
```

如果已有 appReady signal（`StoreState.appReady`），可以据此判断或添加新字段。

- [ ] **Step 3: 批量替换导入**

将 22 个文件中的：
```typescript
import { isTauriShell } from '@tauri-bridge';
```
替换为：
```typescript
import { useStore } from '@stores';
const isTauri = useStore(s => s.isTauri);
```
或将组件级别的 `isTauriShell()` 调用替换为从 props 或 context 获取。

> **注意:** 对于纯非 React 模块（如 `debugLogCollector.ts`），无法使用 `useStore` hook。这些可以保留直接导入，或者将 store 引用方式改为模块级导入。

- [ ] **Step 4: 验证 lint、类型检查和测试**

```bash
cd ai-digital-life\frontend
pnpm run lint 2>&1
pnpm run typecheck 2>&1
pnpm run test 2>&1
```

Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: standardize isTauri detection through store instead of direct bridge imports

22 files imported isTauriShell directly from @tauri-bridge.
Changed to use store selectors for better testability and abstraction."
```

---

## Spec 覆盖率检查

本计划覆盖了我之前的系统性扫描报告(`docs/reports/refactoring-insight/report/daily-insights/2026-07/refactor-insight-2026-07-14-systematic.md`)中的以下发现：

| 报告中的 Risk | 报告中的 Finding | 计划中的 Task |
|---------------|-----------------|---------------|
| Critical | Plugin trait — 0 个真实实现 | Task 1 |
| Critical | PtyEventEmitter trait — 0 个实现 | Task 2 |
| High | 8 个空 catch 块 | Task 3 |
| Medium | 重复的 useClickOutside 模式 | Task 4 |
| Low | 131 个无用的 React import | Task 5 |
| Low | 孤立的 run_activity_seq.rs | Task 6 |
| Low | 未使用的 _fork_message_id 参数 | Task 7 |
| Low | isTauriShell 直接导入 | Task 8 |

### 已知沟壑（不由本计划覆盖但由已有计划覆盖）

| 发现 | 已有计划 |
|------|---------|
| TS 编译错误 + 测试失败 | Plan A: frontend-critical-fixes |
| std::fs 在 async 中同步使用 | Plan B: rust-async-io-compaction (Task 1) |
| Compaction 双遍扫描 | Plan B: rust-async-io-compaction (Task 2) |
| Storage → agent-runtime 依赖反转 | Plan C: rust-storage-inversion |
| console.log 调试产物 | Plan D: code-quality-sweep (Task 1) |
| 硬编码 i18n 字符串 | Plan D: code-quality-sweep (Task 2) |
| unwrap() 调用 | Plan D: code-quality-sweep (Tasks 3-7) |
| 编码风格违规 | Plan D: code-quality-sweep (Tasks 8-10) |
| 空 stub 文件 | Plan D: code-quality-sweep (Task 11) |

### 尚未计划的发现（建议后续评估）

以下发现需要更大的重构投入，建议在本次执行完成后单独评估：

| 发现 | 建议 |
|------|------|
| adl-kernel 架构蠕变（类型 + 运行时行为混合） | 分拆为 `adl-types`（纯类型 + serde）+ 保留运行时在 `adl-kernel`。影响 15 个 crate 的 Cargo.toml |
| SessionRepository 单实现 trait | 如果未来没有第二种存储后端计划，建议移除 trait 使用具体类型 |
| BrowserPanelContent 40+ props 钻取 | 使用 context 或 composite props 接口 |
| `browser_create_for_tab` (105 行) 函数拆分 | 提取平台 WebView2 设置辅助函数 |
| `start_server_inner` (108 行) 函数拆分 | 提取初始化握手续 |
| 工具 dispatch 宏化 | registry.rs 5 个相同模式的工具处理函数 |
| Three-way bridge 三份实现的维护成本 | 从共享类型定义生成桥方法桩的代码生成 |
| 热路径 `.clone()` / `.to_string()` 优化 | 在 agent-runtime 和 change-engine 中减少 ~40 处可避免分配 |
| `ipc`/`ipc_try` 标准化 | 统一错误宏用法 |

---

## 执行顺序建议

1. **Task 1 + Task 2** (Rust 死代码, Critical) — 独立，可在同一 session 中的子代理并行执行
2. **Task 3** (空 catch 块, High) — 独立，可在 Rust 任务执行的同时并行
3. **Task 4 + Task 5** (前端模式改进, Medium) — 独立，可在 Rust 任务之后或同时执行
4. **Task 6 + Task 7** (Rust 残留债务, Low) — 与 Task 1/2 在同一 Rust session 中执行
5. **Task 8** (前端规范, Low) — 与 Task 3/4/5 在同一前端 session 中执行
