# 报错 Toast（替换全局 error 横幅）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全局 `error` 固定横幅替换为右下角、不自动消失、可折叠/展开/复制/关闭的报错 toast，支持 5 条上限 + 「还有 N 条」摘要 + 清空全部，并附带开发模式测试按钮。

**Architecture:** 新增独立 `ErrorToastSlice`（队列）与独立 `ErrorToastContainer` 组件；`captureError`/`clearError` 接线改为入队/清空；删除 `uiSlice` 的 `error`/`setError` 与 `App.tsx` 横幅；标题由 code → i18n 映射在渲染期解析；开发模式（`import.meta.env.DEV`）挂载 `DevErrorTestButtons`。

**Tech Stack:** React 19 + Zustand（切片合并模式）+ motion v12（`motion/react`）+ 自有 SVG icon 系统（`renderIcon`）+ 自有 i18n（`useTCopy`/`formatT`）。

**计划依据:** 设计规格 `docs/superpowers/specs/2026-08-11-error-toast-design.md`

## Global Constraints

- 纯前端改动，无新增 Tauri Command / capability，Tauri 桌面与浏览器模式一致。
- 所有 UI 文案（按钮/aria-label/摘要）必须使用 i18n key，不得硬编码。
- 颜色/间距/圆角/z-index 必须使用 CSS 自定义属性 `var(--…)`，图标用 `renderIcon`（继承 `currentColor`），禁止 emoji。
- 现有顶部居中、自动消失的成功/警告 toast（`toastSlice`/`Toast.tsx`/`toast.css`）**禁止改动**。
- 折叠/展开为纯展示态，存组件内 `useState`，不进全局状态。
- 产品未发布阶段，禁止任何"向后兼容重导出/迁移层"。
- 质量门禁：`pnpm --dir frontend run test`、`pnpm --dir frontend run lint`、`npx tsc --noEmit`（在 `ai-digital-life/frontend` 下）。
- 每个 Task 结束必须 git commit（Conventional Commit，如 `feat(error-toast): …`）。

---

### Task 1: ErrorToastSlice 切片 + store 接线

**Files:**
- Create: `frontend/src/app/stores/slices/errorToastSlice.ts`
- Create: `frontend/src/app/stores/slices/__tests__/errorToastSlice.test.ts`
- Modify: `frontend/src/app/stores/slices.ts`
- Modify: `frontend/src/app/stores/slicedStore.ts`
- Modify: `frontend/src/app/stores/StoreState.ts`

**Interfaces:**
- Consumes: `createUiId`（来自 `stores/shared.ts`，已存在）；`StoreState` 类型。
- Produces（后续任务依赖）:
  - `export interface ErrorToastEntry { id: string; code: string; detail: string; }`
  - `export interface ErrorToastSlice { errorToasts: ErrorToastEntry[]; reportError: (code: string, detail: string) => string; dismissErrorToast: (id: string) => void; clearErrorToasts: () => void; }`
  - `export const createErrorToastSlice: (set, _get) => ErrorToastSlice`
  - store 上新增字段：`errorToasts` / `reportError` / `dismissErrorToast` / `clearErrorToasts`

- [ ] **Step 1: 编写失败测试**

创建 `frontend/src/app/stores/slices/__tests__/errorToastSlice.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../slicedStore';

describe('errorToastSlice', () => {
  beforeEach(() => {
    useAppStore.setState({ errorToasts: [] });
  });

  it('reportError adds an entry and returns its id', () => {
    const id = useAppStore.getState().reportError(
      'WORKSPACE_ERROR',
      'fatal: not a git repository (or any of the parent directories): .git',
    );
    expect(id).toMatch(/^error-toast-/);
    const toasts = useAppStore.getState().errorToasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      id,
      code: 'WORKSPACE_ERROR',
      detail: 'fatal: not a git repository (or any of the parent directories): .git',
    });
  });

  it('reportError appends without removing existing entries', () => {
    const s = useAppStore.getState();
    s.reportError('NOT_FOUND', 'one');
    s.reportError('STORAGE_ERROR', 'two');
    expect(useAppStore.getState().errorToasts).toHaveLength(2);
  });

  it('dismissErrorToast removes only the matching entry', () => {
    const s = useAppStore.getState();
    const id1 = s.reportError('NOT_FOUND', 'one');
    s.reportError('STORAGE_ERROR', 'two');
    s.dismissErrorToast(id1);
    const toasts = useAppStore.getState().errorToasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).not.toBe(id1);
  });

  it('clearErrorToasts empties the list', () => {
    const s = useAppStore.getState();
    s.reportError('NOT_FOUND', 'one');
    s.reportError('STORAGE_ERROR', 'two');
    s.clearErrorToasts();
    expect(useAppStore.getState().errorToasts).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- errorToastSlice`
Expected: FAIL（`errorToasts`/`reportError` 不存在，TypeScript 编译错误或 undefined）。

- [ ] **Step 3: 编写切片实现**

创建 `frontend/src/app/stores/slices/errorToastSlice.ts`：

```ts
/**
 * 报错 Toast 切片
 * 提供不自动消失的报错 toast 队列（右下角持久渲染），与顶部临时 toast 分离。
 */
import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';

export interface ErrorToastEntry {
  id: string;
  code: string;
  detail: string;
}

export interface ErrorToastSlice {
  errorToasts: ErrorToastEntry[];
  reportError: (code: string, detail: string) => string;
  dismissErrorToast: (id: string) => void;
  clearErrorToasts: () => void;
}

export const createErrorToastSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
): ErrorToastSlice => ({
  errorToasts: [],
  reportError: (code, detail) => {
    const id = createUiId('error-toast');
    const entry: ErrorToastEntry = { id, code, detail };
    set((state) => ({ errorToasts: [...state.errorToasts, entry] }));
    return id;
  },
  dismissErrorToast: (id) => {
    set((state) => ({ errorToasts: state.errorToasts.filter((t) => t.id !== id) }));
  },
  clearErrorToasts: () => set({ errorToasts: [] }),
});
```

- [ ] **Step 4: store 接线**

修改 `frontend/src/app/stores/slices.ts`（在 Toast 切片导出附近追加）：

```ts
// 报错 Toast 切片（持久报错队列）
export { type ErrorToastSlice, createErrorToastSlice } from './slices/errorToastSlice';
```

修改 `frontend/src/app/stores/slicedStore.ts`：

1. 在 `import { createToastSlice, ... } from './slices';` 导入列表中追加 `createErrorToastSlice`。
2. 在切片合并块 `...createToastSlice(set, get),` 后追加：

```ts
  ...createErrorToastSlice(set, get), // 报错 Toast 队列（右下角持久）
```

修改 `frontend/src/app/stores/StoreState.ts`：

1. 在 `import type { ToastSlice } from './slices/toastSlice';` 附近追加：

```ts
import type { ErrorToastSlice } from './slices/errorToastSlice';
```

2. 在 `AllSlices` 元组中 `ToastSlice,` 之后追加：

```ts
  ErrorToastSlice,
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- errorToastSlice`
Expected: PASS（4 个用例全绿）。
随后运行 `npx tsc --noEmit` 确认无类型错误。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/app/stores/slices/errorToastSlice.ts frontend/src/app/stores/slices/__tests__/errorToastSlice.test.ts frontend/src/app/stores/slices.ts frontend/src/app/stores/slicedStore.ts frontend/src/app/stores/StoreState.ts
git commit -m "feat(error-toast): add ErrorToastSlice queue to store"
```

---

### Task 2: captureError/clearError 接线改为 errorToasts + 更新既有测试

**Files:**
- Modify: `frontend/src/app/stores/cacheHelpers.ts`
- Modify: `frontend/src/app/stores/actions/generalActions.ts:71-74`
- Modify: `frontend/src/app/stores/__tests__/captureTypedError.test.ts`
- Modify: `frontend/src/app/stores/actions/generalActions.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `reportError` / `clearErrorToasts`（store 上）。
- Produces: `captureError(get, error)` 现在把 `code` 与 `detail`（完整 message）分离入队；`clearError(get)` 清空全部错误 toast；`setError(get, message)` 导出被删除。

- [ ] **Step 1: 编写失败测试**

整体重写 `frontend/src/app/stores/__tests__/captureTypedError.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { NotFoundError } from '../../../shared/typedErrors';
import { captureError } from '../shared';
import type { StoreState } from '../StoreState';

describe('captureError', () => {
  it('reports an AppError with its code and raw message', () => {
    const reportError = vi.fn();
    const get = vi.fn(() => ({ reportError })) as unknown as () => StoreState;
    captureError(get, new NotFoundError('file'));
    expect(reportError).toHaveBeenCalledWith('NOT_FOUND', 'Not found: file');
  });

  it('reports typed code+message objects via fromIpcErrorCode', () => {
    const reportError = vi.fn();
    const get = vi.fn(() => ({ reportError })) as unknown as () => StoreState;
    captureError(get, { code: 'NETWORK_ERROR', message: 'timeout' });
    expect(reportError).toHaveBeenCalledWith('NETWORK_ERROR', 'Network error: timeout');
  });

  it('falls back to a plain message with empty code for strings', () => {
    const reportError = vi.fn();
    const get = vi.fn(() => ({ reportError })) as unknown as () => StoreState;
    captureError(get, 'plain error');
    expect(reportError).toHaveBeenCalledWith('', 'plain error');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- captureTypedError`
Expected: FAIL（captureError 仍调用 `setError`）。

- [ ] **Step 3: 修改 cacheHelpers.ts**

替换 `captureError` 与 `clearError`，并删除不再需要的 `setError` 导出：

```ts
/** 清除全部错误 toast */
export function clearError(get: () => StoreState): void {
  if (get().errorToasts.length > 0) {
    get().clearErrorToasts();
  }
}

/** 捕获错误并入队错误 toast（code 与完整 message 分离） */
export function captureError(get: () => StoreState, error: unknown): void {
  let code = '';
  let detail = '';
  if (error instanceof AppError) {
    code = error.code;
    detail = error.message;
  } else if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const { code: c, message } = error as { code: string; message: string };
    const typed = fromIpcErrorCode(c, message);
    code = typed.code;
    detail = typed.message;
  } else {
    detail =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : error && typeof error === 'object' && 'message' in error
            ? String((error as { message: string }).message)
            : error
              ? String(error)
              : 'An unknown error occurred';
  }
  get().reportError(code, detail);
}
```

同时删除文件末尾的 `export function setError(get, message) { get().setError(message); }` 整个函数（含上方注释）。

- [ ] **Step 4: 修改 generalActions.ts 启动失败路径**

`frontend/src/app/stores/actions/generalActions.ts` 第 71-74 行：

```ts
      if (!appInfoResult.ok) {
        set({ loading: false, error: appInfoResult.error.message });
        return;
      }
```

改为：

```ts
      if (!appInfoResult.ok) {
        set({ loading: false });
        captureError(get, appInfoResult.error);
        return;
      }
```

（`captureError` 已在第 11 行从 `../shared` 导入，无需新增。）

- [ ] **Step 5: 更新 generalActions.test.ts 中两处断言**

`frontend/src/app/stores/actions/generalActions.test.ts`：

① `'captures typed error on failure and clears isFetching'`（约 76-89 行），把 85-87 行替换为：

```ts
    const toasts = useAppStore.getState().errorToasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].code).toBe('CONFIG_ERROR');
    expect(toasts[0].detail).toContain('Invalid preference');
```

② `'clears error on entry'`（约 91-109 行），把 103-108 行替换为：

```ts
    const store = useAppStore.getState();
    store.reportError('CONFIG_ERROR', 'previous error');
    expect(useAppStore.getState().errorToasts).toHaveLength(1);

    await store.updatePreferences({ language: 'en-US' } as AppPreferencePatch);
    expect(useAppStore.getState().errorToasts).toEqual([]);
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- captureTypedError generalActions`
Expected: PASS。
随后运行 `npx tsc --noEmit` 与 `pnpm --dir frontend run lint`，确认全绿（`error`/`setError` 此时仍在 store 中未被移除，App.tsx 不受影响）。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app/stores/cacheHelpers.ts frontend/src/app/stores/actions/generalActions.ts frontend/src/app/stores/__tests__/captureTypedError.test.ts frontend/src/app/stores/actions/generalActions.test.ts
git commit -m "refactor(error-toast): route captureError into error toast queue"
```

---

### Task 3: i18n errors 领域（双语言 + keys 测试）

**Files:**
- Create: `frontend/src/app/i18n/zh-CN/errors.ts`
- Create: `frontend/src/app/i18n/en-US/errors.ts`
- Modify: `frontend/src/app/i18n/zh-CN/index.ts`
- Modify: `frontend/src/app/i18n/en-US/index.ts`
- Modify: `frontend/src/app/i18n/__tests__/keys.test.ts`

**Interfaces:**
- Consumes: 现有 i18n 合并机制（`zhCN`/`enUS` 平铺合并，`CopyKey = keyof typeof zhCN`）。
- Produces（后续任务依赖）：`CopyKey` 新增以下 key：
  - 标题：`errorsGenericTitle`, `errorsWorkspace`, `errorsNotFound`, `errorsInvalidInput`, `errorsStorage`, `errorsConfig`, `errorsIo`, `errorsMigration`, `errorsSecurity`, `errorsApproval`, `errorsPatch`, `errorsTerminal`, `errorsModel`, `errorsInternal`, `errorsNetwork`, `errorsInvoke`, `errorsPreviewApi`
  - 按钮/文案：`errorsCollapse`, `errorsExpand`, `errorsCopy`, `errorsCopied`, `errorsClose`, `errorsMore`（含 `{n}` 插值）, `errorsClearAll`, `errorsInjectOne`, `errorsInjectBatch`

- [ ] **Step 1: 编写失败测试**

在 `frontend/src/app/i18n/__tests__/keys.test.ts` 的 `en-US namespace keys` describe 内追加（约第 130 行 `token usage cost keys` 之后）：

```ts
  it('includes error toast domain keys', () => {
    expect(enUS).toHaveProperty('errorsGenericTitle');
    expect(enUS).toHaveProperty('errorsWorkspace');
    expect(enUS).toHaveProperty('errorsMore');
    expect(enUS).toHaveProperty('errorsClearAll');
    expect(zhCN).toHaveProperty('errorsGenericTitle');
    expect(zhCN).toHaveProperty('errorsWorkspace');
    expect(zhCN).toHaveProperty('errorsClearAll');
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- keys.test`
Expected: FAIL（`errors*` 属性不存在）。

- [ ] **Step 3: 创建 zh-CN/errors.ts**

```ts
export const errorsZh = {
  errorsGenericTitle: '操作失败',
  errorsWorkspace: '工作区错误',
  errorsNotFound: '未找到',
  errorsInvalidInput: '无效输入',
  errorsStorage: '存储错误',
  errorsConfig: '配置错误',
  errorsIo: '输入输出错误',
  errorsMigration: '迁移错误',
  errorsSecurity: '安全错误',
  errorsApproval: '需要审批',
  errorsPatch: '补丁错误',
  errorsTerminal: '终端错误',
  errorsModel: '模型错误',
  errorsInternal: '内部错误',
  errorsNetwork: '网络错误',
  errorsInvoke: '调用错误',
  errorsPreviewApi: '预览服务错误',
  errorsCollapse: '折叠',
  errorsExpand: '展开',
  errorsCopy: '复制',
  errorsCopied: '已复制',
  errorsClose: '关闭',
  errorsMore: '还有 {n} 条',
  errorsClearAll: '清空全部',
  errorsInjectOne: '注入测试报错',
  errorsInjectBatch: '批量注入 7 条',
} as const;
```

- [ ] **Step 4: 创建 en-US/errors.ts**

```ts
export const errorsEn = {
  errorsGenericTitle: 'Operation failed',
  errorsWorkspace: 'Workspace error',
  errorsNotFound: 'Not found',
  errorsInvalidInput: 'Invalid input',
  errorsStorage: 'Storage error',
  errorsConfig: 'Configuration error',
  errorsIo: 'I/O error',
  errorsMigration: 'Migration error',
  errorsSecurity: 'Security error',
  errorsApproval: 'Approval required',
  errorsPatch: 'Patch error',
  errorsTerminal: 'Terminal error',
  errorsModel: 'Model error',
  errorsInternal: 'Internal error',
  errorsNetwork: 'Network error',
  errorsInvoke: 'Invoke error',
  errorsPreviewApi: 'Preview service error',
  errorsCollapse: 'Collapse',
  errorsExpand: 'Expand',
  errorsCopy: 'Copy',
  errorsCopied: 'Copied',
  errorsClose: 'Close',
  errorsMore: '{n} more',
  errorsClearAll: 'Clear all',
  errorsInjectOne: 'Inject test error',
  errorsInjectBatch: 'Inject 7 errors',
} as const;
```

- [ ] **Step 5: 注册进两个 index**

`frontend/src/app/i18n/zh-CN/index.ts`：import `errorsZh` 并在 `zhCN` 对象末尾（`...notificationZh,` 之后）追加 `...errorsZh,`。
`frontend/src/app/i18n/en-US/index.ts`：import `errorsEn` 并在 `enUS` 对象末尾追加 `...errorsEn,`。

（先读 `en-US/index.ts` 确认其合并写法与 zh-CN 一致，再按同样方式追加。）

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- keys.test`
Expected: PASS（含 zh/en 顶层 key 奇偶校验）。
随后 `npx tsc --noEmit`。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app/i18n/zh-CN/errors.ts frontend/src/app/i18n/en-US/errors.ts frontend/src/app/i18n/zh-CN/index.ts frontend/src/app/i18n/en-US/index.ts frontend/src/app/i18n/__tests__/keys.test.ts
git commit -m "feat(i18n): add error toast copy domain (zh/en)"
```

---

### Task 4: ErrorToast 组件 + 样式 + 组件测试

**Files:**
- Create: `frontend/src/app/components/ErrorToast.tsx`
- Create: `frontend/src/styles/components/error-toast.css`
- Modify: `frontend/src/styles/components.css`（追加 `@import './components/error-toast.css';`）
- Create: `frontend/src/app/components/__tests__/ErrorToast.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `ErrorToastEntry`, `errorToasts`, `dismissErrorToast`, `clearErrorToasts`
  - Task 3: CopyKey `errors*`
  - 已有：`renderIcon`（`design-system/icons.ts`）、`copyToClipboard`（`i18n`）、`useTCopy`/`formatT`（`i18n`）、`motion`（`motion/react`）
- Produces（后续任务依赖）:
  - `export const ERROR_TOAST_VISIBLE_LIMIT = 5`
  - `export function ErrorToastContainer(props: { errorToasts: ErrorToastEntry[]; onDismiss: (id: string) => void; onClearAll: () => void }): ReactElement`

- [ ] **Step 1: 编写失败测试**

创建 `frontend/src/app/components/__tests__/ErrorToast.test.tsx`：

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { ErrorToastContainer } from '../ErrorToast';
import type { ErrorToastEntry } from '../../stores/slices/errorToastSlice';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    const formatMap: Record<string, string> = {
      errorsGenericTitle: 'Operation failed',
      errorsWorkspace: 'Workspace error',
      errorsNotFound: 'Not found',
      errorsCopy: 'Copy',
      errorsCopied: 'Copied',
      errorsClose: 'Close',
      errorsCollapse: 'Collapse',
      errorsExpand: 'Expand',
      errorsMore: '{n} more',
      errorsClearAll: 'Clear all',
    };
    return key in formatMap ? formatMap[key as string] : typeof key === 'string' ? key : '';
  },
});

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT as never} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function entry(overrides: Partial<ErrorToastEntry> = {}): ErrorToastEntry {
  return { id: 'e1', code: 'WORKSPACE_ERROR', detail: 'Workspace error: fatal', ...overrides };
}

describe('ErrorToastContainer', () => {
  it('renders title and full detail by default (expanded)', () => {
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={[entry()]} onDismiss={vi.fn()} onClearAll={vi.fn()} />
      </TestProvider>,
    );
    expect(screen.getByText('Workspace error')).toBeTruthy();
    expect(screen.getByText('Workspace error: fatal')).toBeTruthy();
  });

  it('collapses when the collapse button is clicked', () => {
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={[entry()]} onDismiss={vi.fn()} onClearAll={vi.fn()} />
      </TestProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByRole('button', { name: 'Expand' })).toBeTruthy();
  });

  it('copies the full detail when copy is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={[entry()]} onDismiss={vi.fn()} onClearAll={vi.fn()} />
      </TestProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('Workspace error: fatal'));
  });

  it('dismisses a toast when close is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={[entry()]} onDismiss={onDismiss} onClearAll={vi.fn()} />
      </TestProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledWith('e1');
  });

  it('shows a summary with the hidden count when over the limit and clears all', () => {
    const onClearAll = vi.fn();
    const many = Array.from({ length: 7 }, (_, i) => entry({ id: `e${i}`, detail: `detail ${i}` }));
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={many} onDismiss={vi.fn()} onClearAll={onClearAll} />
      </TestProvider>,
    );
    expect(screen.getByText('2 more')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it('falls back to the generic title for unknown codes', () => {
    render(
      <TestProvider>
        <ErrorToastContainer
          errorToasts={[entry({ code: 'UNKNOWN_CODE' })]}
          onDismiss={vi.fn()}
          onClearAll={vi.fn()}
        />
      </TestProvider>,
    );
    expect(screen.getByText('Operation failed')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- ErrorToast`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 创建 ErrorToast.tsx**

```tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useTCopy, copyToClipboard, formatT } from '../i18n';
import { renderIcon, type IconName } from '../../design-system/icons';
import type { ErrorToastEntry } from '../stores/slices/errorToastSlice';
import type { CopyKey } from '../i18n/types';

export const ERROR_TOAST_VISIBLE_LIMIT = 5;

/** error code → i18n 标题 key（未知 code 回退 errorsGenericTitle） */
const ERROR_TITLE_BY_CODE: Record<string, CopyKey> = {
  WORKSPACE_ERROR: 'errorsWorkspace',
  NOT_FOUND: 'errorsNotFound',
  INVALID_INPUT: 'errorsInvalidInput',
  STORAGE_ERROR: 'errorsStorage',
  CONFIG_ERROR: 'errorsConfig',
  IO_ERROR: 'errorsIo',
  MIGRATION_ERROR: 'errorsMigration',
  SECURITY_ERROR: 'errorsSecurity',
  APPROVAL_REQUIRED: 'errorsApproval',
  PATCH_ERROR: 'errorsPatch',
  TERMINAL_ERROR: 'errorsTerminal',
  MODEL_ERROR: 'errorsModel',
  INTERNAL_ERROR: 'errorsInternal',
  NETWORK_ERROR: 'errorsNetwork',
  INVOKE_ERROR: 'errorsInvoke',
  PREVIEW_API_ERROR: 'errorsPreviewApi',
};

function iconHtml(name: IconName, size: 'sm' | 'md' = 'md'): string {
  return renderIcon(name, { size, decorative: true }).value;
}

interface ErrorToastProps {
  entry: ErrorToastEntry;
  onDismiss: (id: string) => void;
}

function ErrorToast({ entry, onDismiss }: ErrorToastProps) {
  const { t } = useTCopy();
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const title = t[ERROR_TITLE_BY_CODE[entry.code] ?? 'errorsGenericTitle'];

  const handleCopy = async () => {
    const result = await copyToClipboard(entry.detail);
    if (result.ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <motion.div
      className={`error-toast${expanded ? ' is-expanded' : ' is-collapsed'}`}
      role="alert"
      aria-live="assertive"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <span
        className="error-toast__icon"
        dangerouslySetInnerHTML={{ __html: iconHtml('alert-octagon') }}
      />
      <div className="error-toast__body">
        <p className="error-toast__title">{title}</p>
        <p className="error-toast__detail">{entry.detail}</p>
      </div>
      <div className="error-toast__actions">
        <button
          type="button"
          className="error-toast__btn"
          aria-label={expanded ? t.errorsCollapse : t.errorsExpand}
          onClick={() => setExpanded((v) => !v)}
          dangerouslySetInnerHTML={{ __html: iconHtml(expanded ? 'chevron-down' : 'chevron-up', 'sm') }}
        />
        <button
          type="button"
          className="error-toast__btn"
          aria-label={copied ? t.errorsCopied : t.errorsCopy}
          onClick={() => void handleCopy()}
          dangerouslySetInnerHTML={{ __html: iconHtml(copied ? 'check' : 'copy', 'sm') }}
        />
        <button
          type="button"
          className="error-toast__btn"
          aria-label={t.errorsClose}
          onClick={() => onDismiss(entry.id)}
          dangerouslySetInnerHTML={{ __html: iconHtml('close', 'sm') }}
        />
      </div>
    </motion.div>
  );
}

interface ErrorToastContainerProps {
  errorToasts: ErrorToastEntry[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

export function ErrorToastContainer({
  errorToasts,
  onDismiss,
  onClearAll,
}: ErrorToastContainerProps) {
  const { t } = useTCopy();
  const visible = errorToasts.slice(-ERROR_TOAST_VISIBLE_LIMIT);
  const hiddenCount = errorToasts.length - visible.length;

  return createPortal(
    <div className="error-toast-region" role="region" aria-label={t.errorsGenericTitle}>
      <AnimatePresence>
        {visible.map((entry) => (
          <ErrorToast key={entry.id} entry={entry} onDismiss={onDismiss} />
        ))}
        {hiddenCount > 0 && (
          <motion.div
            key="error-toast-summary"
            className="error-toast error-toast--summary"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <span
              className="error-toast__icon"
              dangerouslySetInnerHTML={{ __html: iconHtml('alert-octagon') }}
            />
            <span className="error-toast__summary-text">
              {formatT(t, 'errorsMore', { n: hiddenCount })}
            </span>
            <button type="button" className="error-toast__btn" onClick={onClearAll}>
              {t.errorsClearAll}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: 创建 error-toast.css**

```css
/* ==========================================================================
   Error Toast (persistent bottom-right error notifications)
   --------------------------------------------------------------------------
   - Bottom-right region, newest closest to bottom (column-reverse)
   - Small radius (slightly-curved right angles)
   - Collapsible/expandable + copy + close actions; summary when over limit
   ========================================================================== */

.error-toast-region {
  position: fixed;
  right: var(--space-5);
  bottom: var(--space-5);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-2);
  width: min(400px, calc(100vw - var(--space-8)));
  max-width: 400px;
  pointer-events: none;
}

.error-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: var(--space-2-5);
  padding: var(--space-3);
  background: var(--surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(8px);
  color: var(--text-primary);
}

.error-toast__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-top: var(--space-px);
  color: var(--color-danger);
}

.error-toast__icon svg {
  display: block;
}

.error-toast__body {
  flex: 1;
  min-width: 0;
}

.error-toast__title {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  line-height: var(--leading-normal);
  color: var(--color-danger);
}

.error-toast__detail {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
  color: var(--text-secondary);
  word-break: break-all;
  white-space: pre-wrap;
}

.error-toast.is-collapsed .error-toast__detail {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.error-toast__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.error-toast__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background var(--duration-150) var(--ease-enter),
    color var(--duration-150) var(--ease-enter);
}

.error-toast__btn:hover {
  background: var(--surface-subtle);
  color: var(--text-primary);
}

.error-toast__btn svg {
  display: block;
  width: 14px;
  height: 14px;
}

.error-toast--summary {
  align-items: center;
  padding: var(--space-2) var(--space-3);
}

.error-toast__summary-text {
  flex: 1;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.error-toast--summary .error-toast__btn {
  width: auto;
  height: auto;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-danger);
}

/* 开发模式测试按钮（左下角，避开右下角报错区；仅 DEV 渲染） */
.dev-error-buttons {
  position: fixed;
  left: var(--space-5);
  bottom: var(--space-5);
  z-index: var(--z-toast);
  display: flex;
  gap: var(--space-2);
  pointer-events: auto;
}

.dev-error-buttons button {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-elevated);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: color var(--duration-150) var(--ease-enter);
}

.dev-error-buttons button:hover {
  color: var(--text-primary);
}
```

- [ ] **Step 5: 注册样式**

`frontend/src/styles/components.css` 中 `@import './components/toast.css';` 之后追加：

```css
@import './components/error-toast.css';
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- ErrorToast`
Expected: PASS（6 个用例全绿）。
随后 `npx tsc --noEmit` 与 `pnpm --dir frontend run lint`。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app/components/ErrorToast.tsx frontend/src/app/components/__tests__/ErrorToast.test.tsx frontend/src/styles/components/error-toast.css frontend/src/styles/components.css
git commit -m "feat(error-toast): add ErrorToast container with collapse/copy/close and overflow summary"
```

---

### Task 5: 移除 error 状态与横幅，接入容器 + 开发模式测试按钮

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/stores/slices/uiSliceTypes.ts`
- Modify: `frontend/src/app/stores/slices/uiSlice.ts`
- Modify: `frontend/src/app/stores/StoreState.ts`
- Modify: `frontend/src/app/stores/slicedStore.ts`
- Modify: `frontend/src/app/loadingPerformance.test.ts`
- Create: `frontend/src/app/components/DevErrorTestButtons.tsx`

**Interfaces:**
- Consumes: Task 1（`errorToasts`/`dismissErrorToast`/`clearErrorToasts`）、Task 3（`errorsInjectOne`/`errorsInjectBatch`）、Task 4（`ErrorToastContainer`）。
- Produces: `DevErrorTestButtons`（无 props 组件，仅 DEV 挂载）；`App.tsx` 根级订阅 `useAppStore((state) => state.errorToasts)`。

- [ ] **Step 1: 编写失败测试**

修改 `frontend/src/app/loadingPerformance.test.ts` 第 47 行：

```ts
    expect(appSource).toContain('useAppStore((state) => state.error)');
```

改为：

```ts
    expect(appSource).toContain('useAppStore((state) => state.errorToasts)');
```

（该测试读取 `App.tsx` 源码断言根组件保持细粒度订阅；改动后运行应失败——因为 App.tsx 尚未替换选择器。）

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- loadingPerformance`
Expected: FAIL（断言仍匹配旧 `state.error` 或新选择器不存在）。

- [ ] **Step 3: 创建 DevErrorTestButtons.tsx**

```tsx
import { useAppStore } from '../stores/slicedStore';
import { useTCopy } from '../i18n';

/** 模拟报错样本：多样 code + 长 message，便于观察换行/截断/折叠态 */
const SAMPLE_ERRORS: Array<{ code: string; detail: string }> = [
  {
    code: 'WORKSPACE_ERROR',
    detail:
      'Workspace error: fatal: not a git repository (or any of the parent directories): .git',
  },
  {
    code: 'STORAGE_ERROR',
    detail: 'Storage error: failed to write session state to sqlite database: database is locked',
  },
  {
    code: 'NOT_FOUND',
    detail: 'Not found: src/app/features/unknown/path/very/long/component-name-that-wraps.tsx',
  },
  {
    code: 'NETWORK_ERROR',
    detail: 'Network error: request timed out after 30000ms while waiting for provider response',
  },
  {
    code: 'MODEL_ERROR',
    detail: 'Model error: provider returned HTTP 429 rate limit exceeded, retry after 60s',
  },
  {
    code: 'CONFIG_ERROR',
    detail: 'Config error: malformed JSON at line 12 column 5 in agent config file',
  },
  {
    code: 'TERMINAL_ERROR',
    detail: 'Terminal error: failed to spawn shell process with exit code 1: command not found',
  },
];

/** 开发模式测试按钮（import.meta.env.DEV 时挂载，生产构建剔除） */
export function DevErrorTestButtons() {
  const { t } = useTCopy();
  const reportError = useAppStore((s) => s.reportError);

  const pushOne = () => {
    const index = useAppStore.getState().errorToasts.length % SAMPLE_ERRORS.length;
    const sample = SAMPLE_ERRORS[index];
    reportError(sample.code, sample.detail);
  };

  const pushBatch = () => {
    for (const sample of SAMPLE_ERRORS) {
      reportError(sample.code, sample.detail);
    }
  };

  return (
    <div className="dev-error-buttons">
      <button type="button" onClick={pushOne}>
        {t.errorsInjectOne}
      </button>
      <button type="button" onClick={pushBatch}>
        {t.errorsInjectBatch}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 移除 error/setError 状态**

1. `frontend/src/app/stores/StoreState.ts`：`StoreStateRootFields` 中删除 `error?: string;` 一行。
2. `frontend/src/app/stores/slicedStore.ts`：删除根级 `error: undefined,` 一行（位于 `appReady: false,` 之后）。
3. `frontend/src/app/stores/slices/uiSliceTypes.ts`：`UISlice` 接口中删除 `setError: (message?: string) => void;` 一行。
4. `frontend/src/app/stores/slices/uiSlice.ts`：删除 `setError: (message) => set({ error: message }),` 一行。

- [ ] **Step 5: 改造 App.tsx**

1. 第 27 行 `const error = useAppStore((state) => state.error);` 替换为：

```ts
  const errorToasts = useAppStore((state) => state.errorToasts);
```

2. 在 `const removeToast = useAppStore((s) => s.removeToast);` 之后追加：

```ts
  const dismissErrorToast = useAppStore((s) => s.dismissErrorToast);
  const clearErrorToasts = useAppStore((s) => s.clearErrorToasts);
```

3. import 区（`ToastContainer` 导入附近）追加：

```ts
import { ErrorToastContainer } from './components/ErrorToast';
import { DevErrorTestButtons } from './components/DevErrorTestButtons';
```

4. 删除横幅块（第 182-186 行）：

```tsx
          {error ? (
            <div className="adl-banner adl-banner--error" role="alert">
              {error}
            </div>
          ) : null}
```

5. 在 `<ToastContainer toasts={toasts} onRemove={removeToast} />` 之后追加：

```tsx
        <ErrorToastContainer
          errorToasts={errorToasts}
          onDismiss={dismissErrorToast}
          onClearAll={clearErrorToasts}
        />
        {import.meta.env.DEV ? <DevErrorTestButtons /> : null}
```

（`ErrorToastContainer`/`DevErrorTestButtons` 位于 `<TCopyProvider>` 内部，`useTCopy` 可用。）

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- loadingPerformance ErrorToast`
Expected: PASS。
随后在 `ai-digital-life/frontend` 下运行完整质量门禁：

```bash
pnpm run test
pnpm run lint
npx tsc --noEmit
```

Expected: 全绿（0 error）。

- [ ] **Step 7: 手动验收（双端）**

按技能 `run-project-surfaces` 启动浏览器预览（或 Tauri 桌面）：
- 打开一个非 Git 目录作为工作区，触发 `[WORKSPACE_ERROR]`，确认右下角出现报错 toast 且不自动消失。
- 点击折叠按钮 → 只剩标题 + 单行截断详情；再点展开恢复。
- 点击复制按钮 → 剪贴板含完整 detail，按钮短暂显示"已复制"。
- 连续点击「注入测试报错」逐条叠加；点击「批量注入 7 条」→ 显示 5 条 + 「还有 2 条 · 清空全部」。
- 点「清空全部」全部消失。
- 桌面与浏览器模式表现一致。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/app/App.tsx frontend/src/app/stores/slices/uiSliceTypes.ts frontend/src/app/stores/slices/uiSlice.ts frontend/src/app/stores/StoreState.ts frontend/src/app/stores/slicedStore.ts frontend/src/app/loadingPerformance.test.ts frontend/src/app/components/DevErrorTestButtons.tsx
git commit -m "feat(error-toast): remove global error banner, wire container and dev test buttons"
```

---

## 收尾

按仓库规则运行收尾流程（`closing-workflow` 技能）：日志审查、代码审查循环、质量门禁（`cargo clippy --workspace --all-targets -- -D warnings` 不受影响但确认无回归、`pnpm --dir frontend run lint` 0 errors、完整测试全绿）、文档同步（如相关 AGENTS.md/功能清单需要更新"错误提示"说明）。

## Self-Review 记录

- **规格覆盖**：第 1 节 Store/接线 → Task 1+2；第 2 节视觉交互 → Task 4；第 3 节 i18n/标题映射 → Task 3；第 4 节测试按钮 → Task 5（DevErrorTestButtons）+Task 3（文案）；第 5 节双端一致性 → 纯前端天然满足，Task 5 Step 7 手动验收；第 6 节测试 → 各 Task 内嵌红绿测试 + Task 5 Step 6 全量门禁。
- **占位符扫描**：无 TBD/TODO；每个 Step 含完整代码/命令。
- **类型一致性**：`reportError(code, detail)`、`dismissErrorToast(id)`、`clearErrorToasts()`、`ErrorToastContainer({errorToasts,onDismiss,onClearAll})` 在 Task 1/4/5 中签名一致；`ERROR_TOAST_VISIBLE_LIMIT` 在 Task 4 定义并被 Task 4 自身使用；i18n key 名（`errorsMore` 等）Task 3 定义、Task 4/5 引用一致。
