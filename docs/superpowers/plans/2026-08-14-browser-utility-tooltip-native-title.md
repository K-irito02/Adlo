# Browser Utility Tooltip Native-Title 化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将浏览器导航栏 open 模式的两个工具按钮（"始终新建标签页" 与 "关闭所有已打开标签页"）的自定义 Tooltip 改为系统原生 `title`，并把关闭按钮的中文/英文文案改为"关闭所有已打开标签页 / Close all open tabs"。

**Architecture:** 抽取 open 模式两个工具按钮为叶子组件 `BrowserNavUtilityButtons`（props 化文案与回调），在组件内用原生 `title` 替代 `TooltipSimple`；BrowserNavigator 只做接线。遵循 Task 7 抽取 `BrowserNavModeSwitch` 的既有先例。

**Tech Stack:** React 19 + TypeScript + Vitest + @testing-library/react + i18n（en/zh 双域）

**Spec:** `docs/superpowers/specs/2026-08-14-browser-utility-tooltip-native-title-design.md`

## Global Constraints

- 中文文案：**关闭所有已打开标签页**；英文文案：**Close all open tabs**。
- 保留 `aria-label`（与原生 `title` 并存，参照 BrowserNavModeSwitch 既有模式）。
- tabs 模式的 "+" 按钮、书签删除按钮、模式切换开关等其它按钮的 tooltip 方案**保持不变**。
- 不改动 `common.clearAllOpenTabs` 死 key（common.ts:133，未使用）。
- i18n 双域 parity：新增/修改文案必须在 en-US 与 zh-CN 中同时存在（keys.test.ts 校验 key 集合一致）。
- 命令执行目录：前端 `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend`；仓库根 `E:\AI-DIGITAL-LIFE\SourceWorkspace`。
- 质量门禁：`pnpm run typecheck` 0 错误；`pnpm run lint` 0 errors；`pnpm vitest run <file>` 通过。

---

### Task 1: 修改 i18n 文案

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/browser.ts:133`
- Modify: `frontend/src/app/i18n/en-US/browser.ts:141`
- Test: `frontend/src/app/i18n/__tests__/keys.test.ts`（追加断言）

**Interfaces:**
- Consumes: 无
- Produces: `browserClearAllOpenTabs` key 的值：zh = `'关闭所有已打开标签页'`，en = `'Close all open tabs'`（Task 2/3 通过 `t.browserClearAllOpenTabs` 读取）

- [ ] **Step 1: 在 keys.test.ts 追加文案断言（先红）**

在 `frontend/src/app/i18n/__tests__/keys.test.ts` 的 `describe('i18n en-US namespace keys')` 块末尾（第 144 行 `});` 之前）追加：

```ts
  it('browserClearAllOpenTabs copy is close-all-open-tabs', () => {
    expect(enUS.browserClearAllOpenTabs).toBe('Close all open tabs');
    expect(zhCN.browserClearAllOpenTabs).toBe('关闭所有已打开标签页');
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/app/i18n/__tests__/keys.test.ts`
Expected: 新用例 FAIL（当前 zh 为 '清空所有已打开标签'、en 为 'Clear all open tabs'），其余用例 PASS。

- [ ] **Step 3: 修改两个 i18n 文件的文案**

`frontend/src/app/i18n/zh-CN/browser.ts:133`：
```ts
  browserClearAllOpenTabs: '关闭所有已打开标签页',
```

`frontend/src/app/i18n/en-US/browser.ts:141`：
```ts
  browserClearAllOpenTabs: 'Close all open tabs',
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/app/i18n/__tests__/keys.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/i18n/zh-CN/browser.ts frontend/src/app/i18n/en-US/browser.ts frontend/src/app/i18n/__tests__/keys.test.ts
git commit -m "feat(frontend): change clear-open-tabs copy to close-all-open-tabs"
```

---

### Task 2: 抽取 BrowserNavUtilityButtons 叶子组件

**Files:**
- Create: `frontend/src/app/features/browser/BrowserNavUtilityButtons.tsx`
- Test: `frontend/src/app/features/browser/BrowserNavUtilityButtons.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces: 导出组件 `BrowserNavUtilityButtons`，props：
  ```ts
  interface BrowserNavUtilityButtonsProps {
    navigatorMode: 'tabs' | 'open' | 'list' | 'search';
    alwaysNewTabLabel: string;
    clearOpenTabsLabel: string;
    newTabLabel: string;
    onAlwaysNewTab: () => void;
    onClearOpenTabs: () => void;
  }
  ```
  （Task 3 使用该接口接线）

- [ ] **Step 1: 编写失败测试**

创建 `frontend/src/app/features/browser/BrowserNavUtilityButtons.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserNavUtilityButtons } from './BrowserNavUtilityButtons';

const labels = {
  newTab: '新建标签',
  alwaysNewTab: '始终新建标签页',
  clearOpenTabs: '关闭所有已打开标签页',
};

function setup(navigatorMode: 'tabs' | 'open' | 'list' | 'search') {
  const onAlwaysNewTab = vi.fn();
  const onClearOpenTabs = vi.fn();
  render(
    <BrowserNavUtilityButtons
      navigatorMode={navigatorMode}
      newTabLabel={labels.newTab}
      alwaysNewTabLabel={labels.alwaysNewTab}
      clearOpenTabsLabel={labels.clearOpenTabs}
      onAlwaysNewTab={onAlwaysNewTab}
      onClearOpenTabs={onClearOpenTabs}
    />,
  );
  return { onAlwaysNewTab, onClearOpenTabs };
}

describe('BrowserNavUtilityButtons', () => {
  it('renders always-new-tab button with native title and aria-label', () => {
    setup('open');
    const plus = screen.getByRole('button', { name: labels.alwaysNewTab });
    expect(plus).toHaveAttribute('title', labels.alwaysNewTab);
    expect(plus).toHaveAttribute('aria-label', labels.alwaysNewTab);
  });

  it('renders clear-open-tabs button with native title and aria-label', () => {
    setup('open');
    const trash = screen.getByRole('button', { name: labels.clearOpenTabs });
    expect(trash).toHaveAttribute('title', labels.clearOpenTabs);
    expect(trash).toHaveAttribute('aria-label', labels.clearOpenTabs);
  });

  it('renders new-tab button (tabs mode) with native title', () => {
    setup('tabs');
    const plus = screen.getByRole('button', { name: labels.newTab });
    expect(plus).toHaveAttribute('title', labels.newTab);
  });

  it('does not render custom tooltip content element', () => {
    setup('open');
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('invokes onAlwaysNewTab when always-new-tab button clicked', async () => {
    const user = userEvent.setup();
    const { onAlwaysNewTab } = setup('open');
    await user.click(screen.getByRole('button', { name: labels.alwaysNewTab }));
    expect(onAlwaysNewTab).toHaveBeenCalledTimes(1);
  });

  it('invokes onClearOpenTabs when clear button clicked', async () => {
    const user = userEvent.setup();
    const { onClearOpenTabs } = setup('open');
    await user.click(screen.getByRole('button', { name: labels.clearOpenTabs }));
    expect(onClearOpenTabs).toHaveBeenCalledTimes(1);
  });

  it('hides both buttons in list/search modes', () => {
    setup('list');
    expect(screen.queryByRole('button', { name: labels.newTab })).toBeNull();
    expect(screen.queryByRole('button', { name: labels.alwaysNewTab })).toBeNull();
    expect(screen.queryByRole('button', { name: labels.clearOpenTabs })).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/app/features/browser/BrowserNavUtilityButtons.test.tsx`
Expected: FAIL（模块不存在，import 报错）。

- [ ] **Step 3: 实现叶子组件**

创建 `frontend/src/app/features/browser/BrowserNavUtilityButtons.tsx`：

```tsx
import { IconPlus, IconTrash } from '@icons';

interface BrowserNavUtilityButtonsProps {
  navigatorMode: 'tabs' | 'open' | 'list' | 'search';
  alwaysNewTabLabel: string;
  clearOpenTabsLabel: string;
  newTabLabel: string;
  onAlwaysNewTab: () => void;
  onClearOpenTabs: () => void;
}

export function BrowserNavUtilityButtons({
  navigatorMode,
  alwaysNewTabLabel,
  clearOpenTabsLabel,
  newTabLabel,
  onAlwaysNewTab,
  onClearOpenTabs,
}: BrowserNavUtilityButtonsProps) {
  const showPlus = navigatorMode === 'tabs' || navigatorMode === 'open';
  const showClear = navigatorMode === 'open';
  const plusLabel = navigatorMode === 'tabs' ? newTabLabel : alwaysNewTabLabel;
  return (
    <>
      {showPlus && (
        <button
          type="button"
          className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
          onClick={onAlwaysNewTab}
          aria-label={plusLabel}
          title={plusLabel}
        >
          <IconPlus size={14} decorative />
        </button>
      )}
      {showClear && (
        <button
          type="button"
          className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
          onClick={onClearOpenTabs}
          aria-label={clearOpenTabsLabel}
          title={clearOpenTabsLabel}
        >
          <IconTrash size={14} decorative />
        </button>
      )}
    </>
  );
}
```

> 说明：清空按钮仅 open 模式显示；"+" 按钮在 tabs/open 模式显示（原 JSX 用 `display:none` span 在 list/search 隐藏，这里用条件渲染等价实现）。"+" 按钮在 tabs 模式显示 `newTabLabel`（新建标签），open 模式显示 `alwaysNewTabLabel`（始终新建标签页）。原 tabs 模式"+"按钮打开新建标签对话框的逻辑仍留在 BrowserNavigator 内（见 Task 3），通过 `onAlwaysNewTab` 回调分发（回调内再按 `navigatorMode` 分流）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/app/features/browser/BrowserNavUtilityButtons.test.tsx`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/browser/BrowserNavUtilityButtons.tsx frontend/src/app/features/browser/BrowserNavUtilityButtons.test.tsx
git commit -m "feat(frontend): add BrowserNavUtilityButtons leaf with native title"
```

---

### Task 3: BrowserNavigator 接线替换内联按钮

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserNavigator.tsx:179-256`

**Interfaces:**
- Consumes: Task 2 的 `BrowserNavUtilityButtons`（props 见上）
- Produces: 无（组件行为不变，仅 tooltip 机制改变）

- [ ] **Step 1: 先验证改动点行为（已存在的测试基线）**

Run: `pnpm vitest run src/app/features/browser`
Expected: 当前全部 PASS（作为改动前基线）。

- [ ] **Step 2: 接线替换**

将 `BrowserNavigator.tsx:179-256` 的 utility 按钮区替换为使用 `BrowserNavUtilityButtons`。原结构（两个 span，各自包着 TooltipSimple 按钮）：

```tsx
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
          <span style={{ display: navigatorMode === 'open' || navigatorMode === 'tabs' ? '' : 'none' }}>
            <TooltipSimple content={navigatorMode === 'tabs' ? t.browserNewTab : t.browserNewTabAlways} placement="top">
              <button ... onClick={...创建标签对话框 / handleAlwaysNewTab...}>...</button>
            </TooltipSimple>
          </span>
          ...
          <span style={{ display: navigatorMode === 'open' ? '' : 'none' }}>
            <TooltipSimple content={t.browserClearAllOpenTabs} placement="top">
              <button ... onClick={() => handleCloseAllTabs()} ...>...</button>
            </TooltipSimple>
          </span>
        </div>
```

替换为：

```tsx
        <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
          <BrowserNavUtilityButtons
            navigatorMode={navigatorMode}
            newTabLabel={t.browserNewTab}
            alwaysNewTabLabel={t.browserNewTabAlways}
            clearOpenTabsLabel={t.browserClearAllOpenTabs}
            onAlwaysNewTab={() => {
              if (navigatorMode === 'tabs') {
                const path = selectedTreePathRef.current;
                if (!path || (!path.startsWith('folder:') && !path.startsWith('workspace:'))) {
                  showToast(t.browserSelectDirFirst, 'warning');
                  return;
                }
                let wsId: string | undefined;
                let fId: string | undefined;
                if (path.startsWith('workspace:')) {
                  wsId = path.slice('workspace:'.length);
                } else if (path.startsWith('folder:')) {
                  fId = path.slice('folder:'.length);
                  wsId = resolveFolderWorkspaceId(fId, browserTabFolders);
                }
                setCreateTabDialog({ open: true, workspaceId: wsId, folderId: fId });
              } else {
                handleAlwaysNewTab(t.browserNewTabPage);
              }
            }}
            onClearOpenTabs={() => handleCloseAllTabs()}
          />
          {/* 保留：新建目录按钮、书签删除按钮（原生 title 已有）等其它按钮不变 */}
        </div>
```

要点：
- 删除原 "+" 按钮与"清空"按钮的 `TooltipSimple` 包裹，改用叶子组件的原生 `title`。
- 显隐逻辑由叶子组件内部条件渲染承担（`showPlus`：tabs/open；`showClear`：open），与改动前 `display:none` span 的视觉结果一致，无需保留外层 span。
- `navigatorMode` 为 `'list'` 或 `'search'` 时叶子组件不渲染这两个按钮（等价于原 `display:none`）。

- [ ] **Step 3: 核对显隐逻辑并调整**

Run: `pnpm run typecheck`
Expected: 0 错误。若有 `navigatorMode` 类型或未使用变量（如 `browserNewTabAlways` 不再被直接引用）报错，同步清理 BrowserNavigator.tsx 中因替换而不再使用的解构/导入（例如 `t.browserNewTabAlways` 的 TooltipSimple 引用移除后，确认 `TooltipSimple` 是否仍需 import——其仍被模式切换、新建目录等按钮使用，保留）。

- [ ] **Step 4: 运行相关测试与门禁**

Run:
```bash
pnpm vitest run src/app/features/browser
pnpm run typecheck
pnpm run lint
```
Expected: browser 相关测试全部 PASS；typecheck 0 错误；lint 0 errors。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/browser/BrowserNavigator.tsx
git commit -m "refactor(frontend): use BrowserNavUtilityButtons native title in navigator"
```

---

## Self-Review（计划自查）

- **Spec 覆盖**：① 文案改为"关闭所有已打开标签页 / Close all open tabs"→ Task 1 ✅；② 关闭按钮原生 title 化 → Task 2/3 ✅；③ "始终新建标签页"按钮原生 title 化 → Task 2/3 ✅；④ 保留 aria-label → Task 2 测试断言 ✅；⑤ 抽叶子组件 + 组件测试 → Task 2 ✅；⑥ 命名不改 → 计划未动 key/handler 名 ✅；⑦ tabs 模式其它按钮不动 → Task 3 明确保留 ✅；⑧ 不改 common 死 key → 计划未涉及 ✅。
- **占位符扫描**：无 "TBD/TODO"；每个代码步骤均含实际代码。
- **类型一致性**：`BrowserNavUtilityButtonsProps` 在 Task 2 定义、Task 3 消费，字段名一致（`navigatorMode`/`newTabLabel`/`alwaysNewTabLabel`/`clearOpenTabsLabel`/`onAlwaysNewTab`/`onClearOpenTabs`）。i18n key `browserClearAllOpenTabs` 三处一致。
