---
name: browser-automation
description: Browser automation for AI Digital Life. Primary tool: agent-browser (dogfood) — full-featured terminal automation with JS eval, snapshot, console checks. Backup: Browser Harness (CDP) for AI-driven exploration and coordinate clicks. Auxiliary: Playwright CLI for static screenshots. Includes project-specific UI selectors, element state definitions, and wait condition templates. Triggers include "open a website", "test the UI", "take a screenshot", "fill a form", "click a button", "scrape data", "automate browser", "verify UI", "dogfood", "QA", or any task requiring programmatic web interaction with the AI Digital Life app.
---

# Browser Automation

Browser automation for AI Digital Life with progressive disclosure. Three complementary tools, each with a clear role.

## Tool Hierarchy

| Priority | Tool | Role | When to reach for it |
|----------|------|------|---------------------|
| **1 (Primary)** | **agent-browser** (dogfood) | Terminal automation | Default choice for all browser tasks — JS eval, `find role`, `snapshot -i`, `console`, `errors`, session management |
| **2 (Backup)** | **Browser Harness** | CDP exploration | When agent-browser can't help — need coordinate clicks, self-healing helpers, or connection to user's real Chrome |
| **3 (Auxiliary)** | **Playwright CLI** | Static capture | Quick screenshots only — `playwright screenshot <url> <file>` |

**Default workflow**: Start with agent-browser. Fall back to Browser Harness if you need CDP-level access or self-healing. Use Playwright CLI only for one-shot static screenshots.

## Environment Setup

```powershell
# agent-browser (Primary — works out of the box)
# No PATH setup needed — globally installed via npm
agent-browser --version

# Browser Harness (Backup — requires Chrome debug mode)
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"
$env:BU_CDP_URL = "http://127.0.0.1:9222"

# Playwright CLI (Auxiliary — static screenshot only)
$env:PATH = "D:\Program Files\nodejs;E:\dev-tools\npm-global;$env:PATH"
$env:PLAYWRIGHT_BROWSERS_PATH = "E:\dev-tools\playwright-browsers"
```

### Chrome Debug Mode (Browser Harness prerequisite)

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=E:\dev-tools\chrome-debug-profile"
```

## Progressive Disclosure

This skill uses progressive disclosure. Start with the overview below, then load the detailed sub-skill when needed:

| Sub-skill | Load when | Content |
|-----------|-----------|---------|
| [agent-browser (dogfood)](./references/agent-browser.md) | Need full-featured terminal browser automation, JS eval, snapshot, console checks, or dogfood testing | Complete CLI reference, file tree workflow, workspace patterns, state verification |
| [Browser Harness](./references/browser-harness.md) | Need AI-driven exploration, self-healing, or user's real Chrome | CDP commands, screenshot workflow, helpers, script-mode patterns |
| [Playwright CLI](./references/playwright-cli.md) | Need static page screenshots or command reference documentation | Full command reference (reference only), static screenshot capability |
| [ADL 项目专属选择器](./references/adl-project-selectors.md) | Need project-specific UI selectors, element states, or wait conditions for AI Digital Life | Selector priority, CSS class names, element state definitions, wait templates, Playwright Test examples |

**Load a sub-skill by reading its file** when the task falls into its domain. Load multiple when the task requires combining tools.

## Common Workflows

### Full File Tree Testing (agent-browser — Primary)

**Best for**: Complete browser automation with JS eval, DOM traversal, and console verification.

```powershell
# Step 1: Open app with named session
agent-browser --session ft-test --headed open http://127.0.0.1:5173/

# Step 2: Open workspace via in-app API
agent-browser --session ft-test eval "window.digitalLife.workspace.open('E:\\Programs\\Obsidian\\notes').then(r => JSON.stringify(r))"

# Step 3: Click "文件" tab and refresh tree
agent-browser --session ft-test find role tab click --name "文件"
agent-browser --session ft-test eval "document.querySelector('[aria-label=刷新]')?.click()"
agent-browser --session ft-test wait 3000

# Step 4: Expand a directory and click a file
agent-browser --session ft-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') { item.querySelector('.adl-tree-node__toggle')?.click(); break; } } })()"
agent-browser --session ft-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') { const files = item.querySelector('ul')?.querySelectorAll('li'); if (files) for (const f of files) { if (!f.classList.contains('adl-filetree__node--directory')) { f.querySelector('.adl-tree-node__label')?.click(); break; } } break; } } })()"

# Step 5: Switch to "变更" tab
agent-browser --session ft-test find role tab click --name "变更"

# Step 6: Switch back, expand another dir, click another file
agent-browser --session ft-test find role tab click --name "文件"
agent-browser --session ft-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'UIOperationManual') { item.querySelector('.adl-tree-node__toggle')?.click(); break; } } })()"
agent-browser --session ft-test eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'UIOperationManual') { const files = item.querySelector('ul')?.querySelectorAll('li'); if (files) for (const f of files) { const t = f.querySelector('.adl-tree-node__label-text')?.textContent; if (t === 'README.md') { f.querySelector('.adl-tree-node__label')?.click(); break; } } break; } } })()"

# Step 7: Verify and cleanup
agent-browser --session ft-test errors
agent-browser --session ft-test close --all
```

### Full File Tree Testing (Browser Harness — Backup)

**Best for**: CDP-based automation, connecting to user's existing Chrome.

Write a Python script file and execute it:

```python
# bh-test.py
import time

new_tab('http://127.0.0.1:5173/')
wait_for_load()
print("Step 1: Navigated")

js('window.digitalLife.workspace.open("E:/Programs/Obsidian/notes")')
time.sleep(2)
print("Step 2: Workspace opened")

js('document.querySelector("#_r_0_-files-tab")?.click()')
time.sleep(1)
print("Step 3: Files tab clicked")

js('document.querySelector("[aria-label=刷新]")?.click()')
time.sleep(3)
print("Step 4: Refreshed")

js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "docs") { x.querySelector(".adl-tree-node__toggle")?.click(); break; } } })()')
time.sleep(1)
print("Step 5: docs expanded")

js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "docs") { const f = x.querySelector("ul")?.querySelectorAll("li"); if (f) for (const y of f) { if (!y.classList.contains("adl-filetree__node--directory")) { y.querySelector(".adl-tree-node__label")?.click(); break; } } break; } } })()')
time.sleep(1)
print("Step 6: File clicked")

js('document.querySelector("#_r_0_-changes-tab")?.click()')
time.sleep(1)
print("Step 7: Changes tab clicked")

js('document.querySelector("#_r_0_-files-tab")?.click()')
time.sleep(1)
print("Step 8: Files tab back")

js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "UIOperationManual") { x.querySelector(".adl-tree-node__toggle")?.click(); break; } } })()')
time.sleep(1)

js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "UIOperationManual") { const f = x.querySelector("ul")?.querySelectorAll("li"); if (f) for (const y of f) { const t = y.querySelector(".adl-tree-node__label-text")?.textContent; if (t === "README.md") { y.querySelector(".adl-tree-node__label")?.click(); break; } } break; } } })()')
time.sleep(1)
print("Step 9: README.md clicked - ALL DONE!")
```

Then execute:

```powershell
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"; $env:BU_CDP_URL = "http://127.0.0.1:9222"
browser-harness -c "exec(open('bh-test.py').read())"
```

### Quick Static Screenshot (Playwright CLI — Auxiliary)

```bash
playwright screenshot http://localhost:5173 screenshot.png
```

### Quick UI Exploration (Browser Harness)

```powershell
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"; $env:BU_CDP_URL = "http://127.0.0.1:9222"
browser-harness -c "new_tab('http://localhost:5173'); wait_for_load(); print(page_info())"
browser-harness -c "capture_screenshot()"
```

### Bypass Native OS Dialog

The "打开文件夹" menu item triggers a **native OS dialog** that cannot be automated by any tool.
Use `window.digitalLife.workspace.open("path")` via `eval` (agent-browser) or `js()` (Browser Harness) instead:

```powershell
# agent-browser
agent-browser eval "window.digitalLife.workspace.open('E:\\Programs\\Obsidian\\notes').then(r => JSON.stringify(r))"

# Browser Harness
browser-harness -c "js('window.digitalLife.workspace.open(\"E:/Programs/Obsidian/notes\")')"
```

## Tool Comparison

| Dimension | agent-browser (Primary) | Browser Harness (Backup) | Playwright CLI (Auxiliary) |
|-----------|------------------------|--------------------------|---------------------------|
| Role | Full-featured terminal automation | CDP exploration & self-healing | Static screenshots |
| Invocation | Terminal commands | Terminal commands (Python DSL) | Terminal commands |
| Page understanding | Accessibility Tree (`snapshot -i`) | Screenshot (visual) | Static screenshot only |
| Element targeting | ref / `find role` / CSS / eval | Coordinate (x, y) clicks | ❌ Not available |
| JS evaluation | ✅ `eval` | ✅ `js()` helper | ❌ Not available |
| Interactive click | ✅ `click`, `find role` | ✅ `click_at_xy` | ❌ Not available |
| Console/errors check | ✅ `console`, `errors` | ❌ Requires manual CDP | ❌ Not available |
| Accessibility snapshot | ✅ `snapshot -i` | ❌ | ❌ Not available |
| Video recording | ✅ `record start/stop` | ❌ | ❌ |
| In-app API calls | ✅ Via `eval` | ✅ Via `js()` | ❌ |
| Self-healing | No | Yes (writes missing helpers) | No |
| Cross-iframe/shadow DOM | Requires special handling | Automatic (compositor-level) | ❌ |
| Environment setup | None (globally installed) | Chrome debug mode + `$env:BU_CDP_URL` | `$env:PATH` + `$env:PLAYWRIGHT_BROWSERS_PATH` |
| Token efficiency | High (~68 tokens) | Lower (screenshot processing) | High (one-shot command) |

## Project-Specific Notes

- AI Digital Life runs on `http://localhost:5173` in browser dev mode
- Use `npm run dev:browser` from `E:\Programs\Obsidian\notes\ai-digital-life` to start
- For Tauri desktop mode, use `npm run dev:tauri`
- UI selectors and element states are documented in the [ADL 项目专属选择器](./references/adl-project-selectors.md) reference and `UIOperationManual/`
- **Recommended tool**: `agent-browser` (dogfood) is the most capable and easiest to set up — use it as the default for browser automation tasks
- **File tree elements**: Use class names `.adl-filetree__node--directory`, `.adl-tree-node__label-text`, `.adl-tree-node__toggle` for DOM traversal — they are stable across sessions. File tree may need a refresh click after workspace open to trigger loading
- **Tool tab IDs**: `#_r_0_-files-tab` (文件), `#_r_0_-changes-tab` (变更) — stable within a session but may change on app restart. Use `find role tab click --name "文件"` for more stable targeting
- **Bypass native OS dialog**: All tools share the same limitation — the "打开文件夹" native dialog cannot be automated. Use `window.digitalLife.workspace.open("path")` via `eval`/`js()` instead
- **PowerShell semicolons vs &&**: Use `;` (semicolons) to chain commands in PowerShell, not `&&`

## Related Skills

- **dogfood**: Systematic exploratory testing to find bugs and UX issues — uses agent-browser under the hood
- **vitest-testing-patterns**: Unit/component testing with Vitest and React Testing Library
- **playwright-best-practices**: General Playwright test development best practices (if installed)
- **run-project-surfaces**: Starting the app in different modes
