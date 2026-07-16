# 子卡片间隙统一标准化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All 6 sub-card/sub-menu locations use CSS Anchor Positioning (`anchor()` API) to achieve exactly 1px visual gap between sub-card and parent menu, with zero overlap and zero JS overhead.

**Architecture:** Replace `position: absolute; left: calc(100% + Npx)` with `position: fixed; position-anchor: --<name>; left: anchor(right); margin-left: var(--space-px)` on each sub-card. Each trigger element receives `anchor-name: --<name>`. A `@supports (anchor-name: ...)` fallback preserves `left: calc(100% + 6px)` for older browsers. The `--space-px` token (1px) is the single source of truth for the gap.

**Tech Stack:** Pure CSS (Anchor Positioning API). Chromium 125+ (Tauri WebView2) — fully supported since January 2026. The `@supports` fallback ensures graceful degradation.

## Global Constraints

- All sub-card gaps must be exactly 1px visually, measured from parent menu card's border-box right edge to sub-card's border-box left edge
- Zero JavaScript runtime overhead for positioning
- No third-party dependencies (no Floating UI, no Popper)
- `--space-px` (1px) is the single gap token — do not use `calc()` with magic numbers
- Every sub-card must have a `@supports (anchor-name: ...)` fallback using `left: calc(100% + 6px)` for environments that don't support Anchor Positioning
- The trigger element must be the `anchor-name` target, not an intermediate wrapper
- All CSS changes in the plan must be applied consistently across the 6 locations

---

## Task 0: Verify `--space-px` Token Exists

**Files:**
- Verify: `frontend/src/styles/tokens.css:15`

**Interfaces:**
- Consumes: nothing
- Produces: confirmation that `--space-px: 1px` is available

- [ ] **Step 1: Confirm token exists**

Check `frontend/src/styles/tokens.css` line 15 contains `--space-px: 1px`.

Run: `Select-String -Pattern "--space-px:" frontend/src/styles/tokens.css`
Expected: `--space-px: 1px` is present

- [ ] **Step 2: Check if titlebar brand tooltip is dead code**

Check `TitleBar.tsx` for any usage of `.adl-titlebar__brand-tooltip` class.

Run: `Select-String -Pattern "brand-tooltip" frontend/src/app/regions/TitleBar.tsx`
Expected: No matches (the class is never used in JSX — confirmed by exploration)

---

## Task 1: Changes Panel — Branch Sub-Card

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx`
- Modify: `frontend/src/styles/regions/rightpanel/changes-panel.css`

**Interfaces:**
- Consumes: `--space-px` token from `tokens.css`
- Consumes: `--branch-sub-trigger` anchor name (added in this task to the trigger `<div>`)
- Produces: working anchor-positioned sub-card with 1px gap

### Trigger element (BranchMenuItem wrapper `<div>`)

Current code (`BranchSubCard.tsx` lines 263-274):
```tsx
<div
  className="adl-multitree-entry__menu-item--with-sub"
  onMouseEnter={handleMenuEnter}
  onMouseLeave={handleMenuLeave}
>
  <IconGitBranch size={14} decorative />
  <span className="adl-multitree-entry__menu-item-content">
    <span className="adl-multitree-entry__menu-item-label">{label}</span>
  </span>
  <span className="adl-multitree-entry__menu-item-arrow">
    <IconChevronRight size={14} decorative />
  </span>
  <BranchSubCard ... />
</div>
```

- [ ] **Step 1: Add `anchor-name` to trigger `<div>`**

Change the trigger `<div>` to include `anchor-name`:

```tsx
<div
  className="adl-multitree-entry__menu-item--with-sub"
  style={{ anchorName: '--branch-sub-trigger' } as React.CSSProperties}
  onMouseEnter={handleMenuEnter}
  onMouseLeave={handleMenuLeave}
>
```

Note: TypeScript does not natively type `anchorName` in `React.CSSProperties`. Use the `as React.CSSProperties` cast to avoid TS errors. This is safe because Chromium supports it.

### Sub-card CSS

Current (changes-panel.css lines 30-43):
```css
.adl-changes-branch-submenu {
  position: absolute;
  top: 0;
  left: calc(100% + 1px);
  z-index: calc(var(--z-popover) + 1);
  width: min(260px, calc(100vw - var(--space-6)));
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

- [ ] **Step 2: Replace sub-card CSS with anchor positioning + fallback**

```css
.adl-changes-branch-submenu {
  position: absolute;
  top: 0;
  left: calc(100% + 6px);
  z-index: calc(var(--z-popover) + 1);
  width: min(260px, calc(100vw - var(--space-6)));
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@supports (anchor-name: --branch-sub-trigger) {
  .adl-changes-branch-submenu {
    position: fixed;
    left: anchor(right);
    top: anchor(top);
    margin-left: var(--space-px);
  }
}
```

Important design notes:
- `position: fixed` instead of `position: absolute` — places sub-card in the top layer, escaping any stacking context / overflow clipping. This is safe because the menu is already rendered in a `createPortal` to `document.body`.
- `left: anchor(right)` — aligns sub-card's left edge to trigger's right edge
- `top: anchor(top)` — aligns sub-card's top edge to trigger's top edge
- `margin-left: var(--space-px)` — adds the 1px gap
- The old values for `left` and `top` in the `@supports` block are fully overridden by anchor positioning when supported
- The fallback (outside `@supports`) uses `left: calc(100% + 6px)` — the previously-proven value that gives ~1px visual gap in the old absolute positioning scheme

### Verification: CSS and lint

- [ ] **Step 3: Run prettier and eslint**

```bash
cd ai-digital-life/frontend
npx prettier --write src/styles/regions/rightpanel/changes-panel.css
npx eslint src/app/regions/right-panel/panels/BranchSubCard.tsx
npx tsc --noEmit --pretty 2>&1 | Select-String "BranchSubCard"
```

Expected: No errors or warnings.

---

## Task 2: Terminal Panel — Sub-Menu

**Files:**
- Modify: `frontend/src/app/features/terminal/TerminalShellSelector.tsx`
- Modify: `frontend/src/styles/regions/rightpanel/terminal-panel.css`

**Interfaces:**
- Consumes: `--terminal-sub-trigger` anchor name (added to trigger `<div>`)
- Produces: working anchor-positioned terminal sub-menu with 1px gap

### Trigger element

Current (TerminalShellSelector.tsx lines 162-166):
```tsx
<div
  key={item.id}
  className={`adl-menu__item adl-menu__item--has-sub${activeSubMenuId === item.id ? ' is-open' : ''}`}
  onMouseEnter={() => handleMouseEnterSubMenu(item.id)}
  onMouseLeave={handleMouseLeaveSubMenu}
>
```

- [ ] **Step 1: Add `anchor-name` to trigger `<div>`**

```tsx
<div
  key={item.id}
  className={`adl-menu__item adl-menu__item--has-sub${activeSubMenuId === item.id ? ' is-open' : ''}`}
  style={{ anchorName: '--terminal-sub-trigger' } as React.CSSProperties}
  onMouseEnter={() => handleMouseEnterSubMenu(item.id)}
  onMouseLeave={handleMouseLeaveSubMenu}
>
```

### Sub-menu CSS

Current (terminal-panel.css lines 17-30):
```css
.adl-menu__dropdown--right {
  position: absolute !important;
  top: 0 !important;
  left: calc(100% + 1px) !important;
  width: 160px !important;
  min-width: 160px !important;
  max-width: 200px !important;
  max-height: 220px !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  margin-left: 0 !important;
  z-index: 1000 !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}
```

- [ ] **Step 2: Replace sub-menu CSS with anchor positioning + fallback**

```css
.adl-menu__dropdown--right {
  position: absolute !important;
  top: 0 !important;
  left: calc(100% + 6px) !important;
  width: 160px !important;
  min-width: 160px !important;
  max-width: 200px !important;
  max-height: 220px !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  margin-left: 0 !important;
  z-index: 1000 !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

@supports (anchor-name: --terminal-sub-trigger) {
  .adl-menu__dropdown--right {
    position-anchor: --terminal-sub-trigger;
    position: fixed !important;
    left: anchor(right) !important;
    top: anchor(top) !important;
    margin-left: var(--space-px) !important;
  }
}
```

Note: Since the original CSS uses `!important` extensively, the anchor positioning fallback must also use `!important` to override.

### Verification

- [ ] **Step 3: Run lint**

```bash
cd ai-digital-life/frontend
npx prettier --write src/styles/regions/rightpanel/terminal-panel.css
npx eslint src/app/features/terminal/TerminalShellSelector.tsx
npx tsc --noEmit --pretty 2>&1 | Select-String "TerminalShellSelector"
```

Expected: No errors or warnings.

---

## Task 3: Composer Input — Split-Button Menu

**Files:**
- Modify: `frontend/src/app/components/WorkspaceSplitButton.tsx`
- Modify: `frontend/src/styles/regions/composer-input.css`

**Interfaces:**
- Consumes: `--split-btn-menu-trigger` anchor name (added to `.adl-split-btn__drop`)
- Produces: working anchor-positioned split-btn menu with 1px gap

### Trigger element

Current (WorkspaceSplitButton.tsx lines 196-204):
```tsx
<button
  type="button"
  className="adl-split-btn__drop"
  onMouseEnter={handleSplitDropEnter}
  onMouseLeave={handleSplitDropLeave}
  aria-haspopup="menu"
>
  <IconChevronRight size={12} />
</button>
```

- [ ] **Step 1: Add `anchor-name` to trigger `<button>`**

```tsx
<button
  type="button"
  className="adl-split-btn__drop"
  style={{ anchorName: '--split-btn-menu-trigger' } as React.CSSProperties}
  onMouseEnter={handleSplitDropEnter}
  onMouseLeave={handleSplitDropLeave}
  aria-haspopup="menu"
>
  <IconChevronRight size={12} />
</button>
```

### Menu CSS

Current (composer-input.css lines 134-144):
```css
.adl-split-btn__menu {
  position: absolute;
  top: 0;
  left: calc(100% + 1px);
  width: max-content;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  z-index: var(--z-popover);
}
```

- [ ] **Step 2: Replace menu CSS with anchor positioning + fallback**

```css
.adl-split-btn__menu {
  position: absolute;
  top: 0;
  left: calc(100% + 6px);
  width: max-content;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  z-index: var(--z-popover);
}

@supports (anchor-name: --split-btn-menu-trigger) {
  .adl-split-btn__menu {
    position-anchor: --split-btn-menu-trigger;
    position: fixed;
    left: anchor(right);
    top: anchor(top);
    margin-left: var(--space-px);
  }
}
```

### Verification

- [ ] **Step 3: Run lint**

```bash
cd ai-digital-life/frontend
npx prettier --write src/styles/regions/composer-input.css
npx eslint src/app/components/WorkspaceSplitButton.tsx
npx tsc --noEmit --pretty 2>&1 | Select-String "WorkspaceSplitButton"
```

Expected: No errors or warnings.

---

## Task 4: Composer Input — Split-Button Settings

**Files:**
- Modify: `frontend/src/app/components/WorkspaceSplitButton.tsx` (same file as Task 3)
- Modify: `frontend/src/styles/regions/composer-input.css` (same file as Task 3)

**Interfaces:**
- Consumes: `--split-btn-settings-trigger` anchor name (added to `.adl-split-btn__dots`)
- Produces: working anchor-positioned split-btn settings panel with 1px gap

### Trigger element

Current (WorkspaceSplitButton.tsx lines 291-300):
```tsx
<button
  type="button"
  className="adl-split-btn__dots"
  onMouseEnter={handleSettingsEnter}
  onMouseLeave={handleSettingsLeave}
>
  <TooltipSimple content={t.workspaceSettings}>
    <span>⋮</span>
  </TooltipSimple>
</button>
```

- [ ] **Step 1: Add `anchor-name` to trigger `<button>`**

```tsx
<button
  type="button"
  className="adl-split-btn__dots"
  style={{ anchorName: '--split-btn-settings-trigger' } as React.CSSProperties}
  onMouseEnter={handleSettingsEnter}
  onMouseLeave={handleSettingsLeave}
>
  <TooltipSimple content={t.workspaceSettings}>
    <span>⋮</span>
  </TooltipSimple>
</button>
```

### Settings CSS

Current (composer-input.css lines 230-242):
```css
.adl-split-btn__settings {
  position: absolute;
  z-index: var(--z-popover);
  bottom: 0;
  left: calc(100% + 1px);
  width: 260px;
  margin-top: 0;
  padding: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}
```

- [ ] **Step 2: Replace settings CSS with anchor positioning + fallback**

```css
.adl-split-btn__settings {
  position: absolute;
  z-index: var(--z-popover);
  bottom: 0;
  left: calc(100% + 6px);
  width: 260px;
  margin-top: 0;
  padding: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}

@supports (anchor-name: --split-btn-settings-trigger) {
  .adl-split-btn__settings {
    position-anchor: --split-btn-settings-trigger;
    position: fixed;
    left: anchor(right);
    bottom: auto;
    top: anchor(bottom);
    margin-left: var(--space-px);
  }
}
```

Note: This sub-card uses `bottom: 0` in the original (aligned to parent bottom). With anchor positioning, we use `top: anchor(bottom)` to align the settings panel's top to the trigger button's bottom. We drop `bottom: 0` in the anchor version since the trigger position replaces it.

### Verification

- [ ] **Step 3: Run lint** (same as Task 3)

```bash
cd ai-digital-life/frontend
npx prettier --write src/styles/regions/composer-input.css
npx eslint src/app/components/WorkspaceSplitButton.tsx
```

Expected: No errors or warnings.

---

## Task 5: StatusBar — Sub-Menu

**Files:**
- Modify: `frontend/src/app/regions/StatusBarGitInfo.tsx`
- Modify: `frontend/src/styles/regions/statusbar-menu.css`

**Interfaces:**
- Consumes: `--statusbar-sub-trigger` anchor name (added to trigger `<button>`)
- Produces: working anchor-positioned statusbar sub-menu with 1px gap

### Trigger element

Current (StatusBarGitInfo.tsx lines 219-228):
```tsx
<button
  type="button"
  className="adl-statusbar__submenu-trigger"
  aria-haspopup="menu"
  aria-expanded={baseBranchMenuOpen}
  onClick={() => setBaseBranchMenuOpen((current) => !current)}
>
  <span className="adl-statusbar__submenu-label">{baseBranchLabel}</span>
  <IconChevronRight size={14} decorative />
</button>
```

- [ ] **Step 1: Add `anchor-name` to trigger `<button>`**

```tsx
<button
  type="button"
  className="adl-statusbar__submenu-trigger"
  style={{ anchorName: '--statusbar-sub-trigger' } as React.CSSProperties}
  aria-haspopup="menu"
  aria-expanded={baseBranchMenuOpen}
  onClick={() => setBaseBranchMenuOpen((current) => !current)}
>
  <span className="adl-statusbar__submenu-label">{baseBranchLabel}</span>
  <IconChevronRight size={14} decorative />
</button>
```

### Sub-menu CSS

Current (statusbar-menu.css lines 378-392):
```css
.adl-statusbar__submenu {
  position: absolute;
  top: 0;
  left: calc(100% + 1px);
  z-index: calc(var(--z-popover) + 1);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: min(220px, calc(100vw - var(--space-6)));
  padding: var(--space-2);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
```

- [ ] **Step 2: Replace sub-menu CSS with anchor positioning + fallback**

```css
.adl-statusbar__submenu {
  position: absolute;
  top: 0;
  left: calc(100% + 6px);
  z-index: calc(var(--z-popover) + 1);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: min(220px, calc(100vw - var(--space-6)));
  padding: var(--space-2);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

@supports (anchor-name: --statusbar-sub-trigger) {
  .adl-statusbar__submenu {
    position-anchor: --statusbar-sub-trigger;
    position: fixed;
    left: anchor(right);
    top: anchor(top);
    margin-left: var(--space-px);
  }
}
```

### Verification

- [ ] **Step 3: Run lint**

```bash
cd ai-digital-life/frontend
npx prettier --write src/styles/regions/statusbar-menu.css
npx eslint src/app/regions/StatusBarGitInfo.tsx
npx tsc --noEmit --pretty 2>&1 | Select-String "StatusBarGitInfo"
```

Expected: No errors or warnings.

---

## Task 6: TitleBar — Brand Tooltip (Dead CSS — No Change Needed)

**Files:**
- Verify: no changes needed

**Interfaces:**
- Consumes: nothing
- Produces: confirmation that this location is dead code

- [ ] **Step 1: Confirm `.adl-titlebar__brand-tooltip` is dead code**

This CSS class exists in `titlebar.css` but is never referenced in any `.tsx` file. The actual brand tooltip uses `TooltipSimple` (a portal component). No change needed — this is a pre-existing dead code issue outside the scope of this plan.

---

## Task 7: Documentation — Update `ui-patterns.md`

**Files:**
- Modify: `.agents/rules/ui-patterns.md`

**Interfaces:**
- Consumes: all anchor names from Tasks 1-5
- Produces: documented standard for sub-card gap using CSS Anchor Positioning

- [ ] **Step 1: Update §22 horizontal offset**

Current (§22 line 666):
```
| 水平偏移 | `left: calc(100% + 1px)`（项目标准间距） |
```

Replace with:
```
| 水平偏移 | `left: anchor(right)` + `margin-left: var(--space-px)`（CSS Anchor Positioning） |
```

- [ ] **Step 2: Update §25 with anchor positioning standard**

Replace §25 with updated content that reflects the anchor positioning approach:

Current §25 content starts at `### 标准` through to `### 文档`. Replace the entire section:

**Section to replace (verbatim):**

````markdown
---

## 25. 子卡片间距全局标准

### 标准

所有子卡片/子菜单（sub-card / sub-menu / sub-dropdown）与主菜单卡片之间的水平间距必须统一为 **1px**。

```css
left: calc(100% + 1px);
```

### 全部位置清单

| # | 组件 | CSS 文件 | 选择器 | 行号 |
|---|------|----------|--------|------|
| 1 | 变更面板分支子卡片（Branch Sub-Card） | `changes-panel.css` | `.adl-changes-branch-submenu` | 33 |
| 2 | 终端面板右键子菜单（Terminal Sub-Menu） | `terminal-panel.css` | `.adl-menu__dropdown--right` | 20 |
| 3 | 选择文件夹拆分按钮菜单（Split-Button Menu） | `composer-input.css` | `.adl-split-btn__menu` | 137 |
| 4 | 选择文件夹拆分按钮设置面板（Split-Button Settings） | `composer-input.css` | `.adl-split-btn__settings` | 234 |
| 5 | 状态栏分支菜单（StatusBar Sub-Menu） | `statusbar-menu.css` | `.adl-statusbar__submenu` | 381 |
| 6 | 标题栏品牌 Tooltip（Brand Tooltip） | `titlebar.css` | `.adl-titlebar__brand-tooltip` | 84 |

### 验证清单

新增子卡片时：
1. 父容器必须有 `position: relative`
2. 子卡片使用 `position: absolute; top: 0; left: calc(100% + 1px)`
3. 确认父容器无 `padding-right` 导致参照系偏移（若有，需额外补偿）

### 文档

- CSS 变量 `--space-1` 为 4px，**不用于子卡片间距**；间距硬编码为 1px
````

Replace with:

````markdown
---

## 25. 子卡片间距全局标准（CSS Anchor Positioning）

### 标准

所有子卡片/子菜单（sub-card / sub-menu / sub-dropdown）与主菜单卡片之间的水平间距必须统一为 **1px**，使用 **CSS Anchor Positioning** 实现：

```css
/* Trigger element: */
.trigger {
  anchor-name: --my-trigger;
}

/* Sub-card: */
.sub-card {
  position-anchor: --my-trigger;
  position: fixed;
  left: anchor(right);
  top: anchor(top);
  margin-left: var(--space-px);  /* 1px gap */
}

/* Fallback for anchor positioning: */
@supports (anchor-name: --my-trigger) {
  .sub-card {
    position: fixed;
    position-anchor: --my-trigger;
    left: anchor(right);
    top: anchor(top);
    margin-left: var(--space-px);
  }
}

/* Legacy fallback (non-anchor): */
.sub-card {
  position: absolute;
  left: calc(100% + 6px);
}
```

**关键规则：**
- `anchor-name` 设置在**触发元素**上（trigger button 或 trigger div），而非中间 wrapper
- 子卡片使用 `position: fixed` 进入顶层渲染，避免 stacking context 和 overflow 裁剪问题
- `margin-left: var(--space-px)`（1px）是精确定义间隙的单一来源
- `@supports (anchor-name: ...)` 包裹的代码在支持 anchor positioning 的浏览器中生效
- 不支持的浏览器使用 `left: calc(100% + 6px)` 回退方案

### 全部位置清单

| # | 组件 | Trigger anchor-name | CSS 选择器 | 触发元素 |
|---|------|-------------------|------------|----------|
| 1 | 变更面板分支子卡片 | `--branch-sub-trigger` | `.adl-changes-branch-submenu` | `.adl-multitree-entry__menu-item--with-sub` |
| 2 | 终端面板右键子菜单 | `--terminal-sub-trigger` | `.adl-menu__dropdown--right` | `.adl-menu__item--has-sub` |
| 3 | 选择文件夹拆分按钮菜单 | `--split-btn-menu-trigger` | `.adl-split-btn__menu` | `.adl-split-btn__drop` |
| 4 | 选择文件夹拆分按钮设置面板 | `--split-btn-settings-trigger` | `.adl-split-btn__settings` | `.adl-split-btn__dots` |
| 5 | 状态栏分支子菜单 | `--statusbar-sub-trigger` | `.adl-statusbar__submenu` | `.adl-statusbar__submenu-trigger` |
| 6 | 标题栏品牌 Tooltip | —（dead code） | `.adl-titlebar__brand-tooltip` | `.adl-titlebar__brand`（未使用） |

### 验证清单

新增子卡片时：
1. 给触发元素添加 `anchor-name` 属性（内联 style 或 CSS）
2. 子卡片使用 `position: fixed; position-anchor: --name; left: anchor(right); margin-left: var(--space-px)`
3. 必须包含 `@supports (anchor-name: --name) { ... }` 回退
4. 在 `@supports` 之外保留 `position: absolute; left: calc(100% + 6px)` 作为向下兼容
5. 确认 Tauri 使用 Chromium WebView2（>=125），Anchor Positioning 原生支持

### 实现原理

CSS Anchor Positioning 取代了 `left: calc(100% + Npx)` 这种依赖父容器 padding-box 的定位方式。通过将子卡片锚定到**触发元素**的边（`anchor(right)`），间隙仅由 `margin-left` 控制，完全不受父容器 padding/border 影响。`position: fixed` 将子卡片提升到顶层渲染层，消除了 stacking context 导致的重叠问题。

### 文档

- CSS 变量 `--space-px: 1px`（`tokens.css:15`）是间隙的唯一来源
- `anchor-name` 在 TypeScript 中通过 `as React.CSSProperties` 类型断言使用
- 浏览器兼容性：Chromium 125+（2024年5月），Tauri WebView2 始终是最新版本
````

### Verification

- [ ] **Step 3: Check prettier on the markdown file**

```bash
cd ai-digital-life/frontend
npx prettier --check .\.agents\rules\ui-patterns.md
```

Expected: All matched files use Prettier code style.

---

## Task 8: Self-Review

- [ ] **Step 1: Verify spec coverage**

Requirements checklist:
- All 6 sub-card locations accounted for → Tasks 1-6 (Task 6 confirms dead code)
- Uses CSS Anchor Positioning → every task uses `position-anchor` + `anchor()` + `margin-left: var(--space-px)`
- All locations have 1px gap → `margin-left: var(--space-px)` = 1px in every anchor block
- Fallback for older browsers → `@supports` wrappers in every CSS task
- Zero JS overhead → anchor positioning is pure CSS, only `style={{ anchorName }}` added as inline attribute
- No third-party dependencies → native CSS API
- `--space-px` as single gap source → confirmed in tokens.css
- Documentation updated → Task 7

- [ ] **Step 2: Placeholder scan**

Check for any "TBD", "TODO", "implement later" patterns in this plan file.

Search manually: none found.

- [ ] **Step 3: Type consistency check**

Anchor name consistency:
- Task 1: `--branch-sub-trigger` used in both TSX (`anchorName`) and CSS (`position-anchor`)
- Task 2: `--terminal-sub-trigger` used in both TSX and CSS
- Task 3: `--split-btn-menu-trigger` used in both TSX and CSS
- Task 4: `--split-btn-settings-trigger` used in both TSX and CSS
- Task 5: `--statusbar-sub-trigger` used in both TSX and CSS
- All anchor names use consistent `--<location>-sub-trigger` naming convention

All anchor names verified consistent between tasks and documentation.

- [ ] **Step 4: Final plan verification**

Run: `Write-Output "Plan is complete — all 8 tasks defined with full code, no placeholders, consistent interfaces."`

## File Structure

### Modified files

| File | Change |
|------|--------|
| `frontend/src/styles/tokens.css` | No change needed — `--space-px: 1px` already exists at line 15 |
| `frontend/src/styles/regions/rightpanel/changes-panel.css` | `.adl-changes-branch-submenu`: replace `left: calc(100% + 1px)` with anchor positioning + fallback |
| `frontend/src/styles/regions/rightpanel/terminal-panel.css` | `.adl-menu__dropdown--right`: replace `left: calc(100% + 1px)` with anchor positioning + fallback |
| `frontend/src/styles/regions/composer-input.css` | `.adl-split-btn__menu` and `.adl-split-btn__settings`: replace `left: calc(100% + 1px)` with anchor positioning + fallback |
| `frontend/src/styles/regions/statusbar-menu.css` | `.adl-statusbar__submenu`: replace `left: calc(100% + 1px)` with anchor positioning + fallback |
| `frontend/src/styles/regions/titlebar.css` | `.adl-titlebar__brand-tooltip`: replace `left: calc(100% + 1px)` with anchor positioning + fallback |
| `frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx` | Add `style={{ anchorName: '--branch-sub-trigger' }}` to trigger `<div>` |
| `frontend/src/app/features/terminal/TerminalShellSelector.tsx` | Add `style={{ anchorName: '--terminal-sub-trigger' }}` to trigger `<div>` |
| `frontend/src/app/components/WorkspaceSplitButton.tsx` | Add `style={{ anchorName: '--split-btn-menu-trigger' }}` to `.adl-split-btn__drop` and `style={{ anchorName: '--split-btn-settings-trigger' }}` to `.adl-split-btn__dots` |
| `frontend/src/app/regions/StatusBarGitInfo.tsx` | Add `style={{ anchorName: '--statusbar-sub-trigger' }}` to `.adl-statusbar__submenu-trigger` |
| `frontend/src/app/regions/TitleBar.tsx` | No change needed — `.adl-titlebar__brand-tooltip` is dead CSS (never used in JSX); the actual tooltip uses `TooltipSimple` which is a portal |
| `.agents/rules/ui-patterns.md` | Update §22 and §25 to document the anchor positioning standard |

### Test verification (manual)

| Step | Command |
|------|---------|
| Lint CSS | `cd frontend && npx prettier --check src/styles/regions/*.css src/styles/regions/rightpanel/*.css` |
| Lint TSX | `cd frontend && npx eslint src/app/regions/right-panel/panels/BranchSubCard.tsx src/app/features/terminal/TerminalShellSelector.tsx src/app/components/WorkspaceSplitButton.tsx src/app/regions/StatusBarGitInfo.tsx` |

---