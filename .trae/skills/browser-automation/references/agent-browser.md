# agent-browser Reference

Fast browser automation CLI for AI agents. This is the tool used by the **dogfood** skill for systematic exploratory testing.

## Installation

```powershell
# Already installed at:
# Binary: C:\Users\31432\AppData\Roaming\npm\agent-browser

# No PATH setup needed — available globally via npm
agent-browser --version
```

## Core Capabilities (Verified via Testing)

The following capabilities were verified through actual testing on AI Digital Life:

| Capability | Command | Verified |
|------------|---------|----------|
| Open page | `agent-browser open <url>` | ✅ |
| JS evaluation | `agent-browser eval "<js>"` | ✅ |
| Click by role+name | `agent-browser find role <role> click --name <name>` | ✅ |
| Click by ref | `agent-browser click <ref>` | ✅ |
| Screenshot | `agent-browser screenshot <path>` | ✅ |
| Accessibility snapshot | `agent-browser snapshot -i` | ✅ |
| Console logs | `agent-browser console` | ✅ |
| Page errors | `agent-browser errors` | ✅ |
| Wait | `agent-browser wait <ms>` | ✅ |
| Session management | `agent-browser --session <name>` | ✅ |
| Close session | `agent-browser close --all` | ✅ |

## When to Use

| Scenario | Why agent-browser |
|----------|-------------------|
| Full-featured browser automation from terminal | Supports `eval`, `click`, `fill`, `find role`, `snapshot`, `screenshot`, `console` — the most complete CLI tool |
| Dogfood/exploratory testing | Used by the `dogfood` skill; has `record start/stop` for video capture |
| Need accessibility tree | `snapshot -i` returns structured accessibility tree with ref numbers for targeting |
| Need console error checking | `console` and `errors` commands check for JS errors without manual inspection |
| Complex multi-step workflows | Session management with `--session` flag, command chaining |

## Project-Specific: AI Digital Life

### Complete Testing Workflow

This is the full file tree testing workflow verified in an actual test session:

```powershell
# Step 1: Open app with named session (headed mode shows browser window)
agent-browser --session dogfood-test --headed open http://127.0.0.1:5173/

# Step 2: Open workspace via in-app API (bypasses native OS dialog)
agent-browser --session dogfood-test eval "window.digitalLife.workspace.open('E:\\Programs\\Obsidian\\notes').then(r => JSON.stringify(r))"

# Step 3: Click "文件" tab by role
agent-browser --session dogfood-test find role tab click --name "文件"

# Step 4: Refresh file tree to trigger loading
agent-browser --session dogfood-test click <ref-from-snapshot>
# OR using CSS selector directly:
agent-browser --session dogfood-test eval "document.querySelector('[aria-label=刷新]')?.click()"

# Step 5: Wait for tree to load
agent-browser --session dogfood-test wait 2000

# Step 6: Expand "docs" directory by name (DOM traversal via eval)
agent-browser --session dogfood-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') { item.querySelector('.adl-tree-node__toggle')?.click(); break; } } })()"

# Step 7: Click a file inside expanded directory
agent-browser --session dogfood-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') { const files = item.querySelector('ul')?.querySelectorAll('li'); if (files) for (const f of files) { if (!f.classList.contains('adl-filetree__node--directory')) { f.querySelector('.adl-tree-node__label')?.click(); break; } } break; } } })()"

# Step 8: Take screenshot to verify
agent-browser --session dogfood-test screenshot E:\path\to\screenshots\result.png

# Step 9: Switch to "变更" tab
agent-browser --session dogfood-test find role tab click --name "变更"

# Step 10: Switch back and click another file
agent-browser --session dogfood-test find role tab click --name "文件"
agent-browser --session dogfood-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'UIOperationManual') { item.querySelector('.adl-tree-node__toggle')?.click(); break; } } })()"
agent-browser --session dogfood-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'UIOperationManual') { const files = item.querySelector('ul')?.querySelectorAll('li'); if (files) for (const f of files) { const t = f.querySelector('.adl-tree-node__label-text')?.textContent; if (t === 'README.md') { f.querySelector('.adl-tree-node__label')?.click(); break; } } break; } } })()"

# Step 11: Verify no console errors
agent-browser --session dogfood-test console
agent-browser --session dogfood-test errors

# Step 12: Clean up
agent-browser --session dogfood-test close --all
```

### Key Patterns

#### Open Workspace (Bypass Native Dialog)

```powershell
# The "打开文件夹" menu triggers a native OS dialog — use the API directly
agent-browser eval "window.digitalLife.workspace.open('E:\\Programs\\Obsidian\\notes').then(r => JSON.stringify(r))"
```

#### Find Elements by Role (Most Stable)

```powershell
# Click by role and name — not affected by DOM changes
agent-browser find role tab click --name "文件"
agent-browser find role button click --name "主题"

# List all interactive elements for ref targeting
agent-browser snapshot -i
```

#### DOM Traversal for Dynamic Content

```powershell
# Evaluate arbitrary JS for complex DOM navigation
agent-browser eval "document.querySelector('.adl-filetree-scroll')?.querySelectorAll('li')?.length"
```

#### State Verification

```powershell
# Check for JavaScript errors
agent-browser errors

# Check console output
agent-browser console

# Get accessibility snapshot
agent-browser snapshot -i --depth 2
```

## Common Gotchas

| Issue | Workaround |
|-------|------------|
| `find role` may not match localized names | Use `eval` with DOM traversal instead |
| `eval` with backslashes needs double escaping | Use `E:\\path` (double backslash) in `eval`, or `E:/path` (forward slash) — both work |
| File tree not shown after workspace open | Click refresh button first (`[aria-label=刷新]`) |
| Session daemon keeps running after close | Use `close --all` to terminate |
