# 终端空状态 Implementation Plan

> **For agentic workers:** This is a small focused change on 2 files. Inline execution recommended.

**Goal:** Replace the split-pill button in terminal empty state with a descriptive card UI that lists Shell types as clickable items (no button styling).

**Architecture:** Pure CSS + TSX change. No new components, no state changes. The card dynamically reads from existing `shellMenuItems` array, filtering for profile-type entries. Clicking an item calls the existing `handleCreateTab(profile)`.

**Tech Stack:** React 19, TypeScript, CSS custom properties

---

### Task 1: Add CSS classes to `regions.css`

**Files:**
- Modify: `e:\Programs\Obsidian\notes\ai-digital-life\frontend\src\styles\regions.css:4428-4434`

- [ ] **Step 1: Replace the old empty-state CSS with new card styles**

Locate `.adl-tool-primary--terminal-empty` at line 4428. Replace the block and add new card classes after it.

```css
/* ---- 终端空状态卡片 ---- */
.adl-terminal-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--bg);
}

.adl-terminal-empty__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: 28px 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  max-width: 380px;
}

.adl-terminal-empty__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: var(--font-sm);
}

.adl-terminal-empty__text {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--text-muted);
  text-align: center;
  line-height: 1.6;
}

.adl-terminal-empty__items {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  justify-content: center;
}

.adl-terminal-empty__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  cursor: pointer;
  border: 1px solid transparent;
  color: var(--text-secondary);
  transition: background-color var(--duration-150) var(--ease-default),
              border-color var(--duration-150) var(--ease-default);
  background: transparent;
}

.adl-terminal-empty__item:hover {
  border-color: var(--border);
  background: var(--bg-muted);
}

.adl-terminal-empty__item:active {
  background: var(--surface-hover);
}

.adl-terminal-empty__prefix {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: var(--font-xs);
}

.adl-terminal-empty__footer {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--text-muted);
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `npm --prefix frontend run typecheck`
Expected: No errors related to CSS (CSS changes don't affect typecheck).

---

### Task 2: Modify empty state rendering in `TerminalPanel.tsx`

**Files:**
- Modify: `e:\Programs\Obsidian\notes\ai-digital-life\frontend\src\app\regions\right-panel\TerminalPanel.tsx:466-469`

- [ ] **Step 1: Add `ShellPrefix` component and `shellTypeItems` memo before the component return**

Insert before the `return` statement (around line 284):

```tsx
function ShellPrefix({ profile }: { profile?: TerminalProfile }) {
  const map: Record<string, { text: string; color: string }> = {
    powershell: { text: "PS", color: "var(--green, #4ade80)" },
    cmd: { text: ">", color: "var(--blue, #60a5fa)" },
    bash: { text: "$", color: "var(--yellow, #facc15)" },
  };
  const entry = map[profile ?? "powershell"];
  return (
    <span
      className="adl-terminal-empty__prefix"
      style={{ color: entry?.color }}
    >
      {entry?.text ?? "$"}
    </span>
  );
}

const shellTypeItems = useMemo(
  () => shellMenuItems.filter((item) => "profile" in item),
  [shellMenuItems]
);
```

Note: `ShellPrefix` is a small component defined outside `TerminalPanel` (before the function declaration), since it doesn't need component state. `shellTypeItems` goes inside the component, after the `shellMenuItems` definition.

- [ ] **Step 2: Replace the empty state content block**

Replace lines 466-469 (the `else` branch of `hasActiveTab ?`):

```tsx
) : (
  <div className="adl-terminal-empty">
    <div className="adl-terminal-empty__card">
      <div className="adl-terminal-empty__header">
        <IconTerminal size={16} decorative />
        <span>终端面板</span>
      </div>
      <p className="adl-terminal-empty__text">
        当前没有打开的终端会话。<br />
        选择一个 Shell 类型开始：
      </p>
      <div className="adl-terminal-empty__items">
        {shellTypeItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className="adl-terminal-empty__item"
            onClick={() => handleCreateTab(item.profile)}
          >
            <ShellPrefix profile={item.profile} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <p className="adl-terminal-empty__footer">
        点击直接创建 · 也支持在工具栏操作
      </p>
    </div>
  </div>
)}
```

- [ ] **Step 3: Run typecheck**

Run: `npm --prefix frontend run typecheck`
Expected: PASS with no errors

---

### Task 3: Visual verification

- [ ] **Step 1: Verify dev server is running**

Dev server should already be running at http://127.0.0.1:5173/. If not:
Run `npm run dev:browser` in `e:\Programs\Obsidian\notes\ai-digital-life`

- [ ] **Step 2: Open in Trae built-in browser**

Navigate to http://127.0.0.1:5173/ and open the terminal panel.

- [ ] **Step 3: Verify empty state**

- Confirm the new card replaces the old split-pill button
- Hover over each Shell option: border + background should appear
- Click PowerShell/CMD/Bash: terminal tab should be created with correct Shell type
- Verify card looks correct in both light and dark themes
- Verify toolbar split-pill button remains unchanged
