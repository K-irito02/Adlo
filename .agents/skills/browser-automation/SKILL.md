---
name: browser-automation
description: Browser automation for AI Digital Life using four complementary tools — MCP Playwright Tools (built-in), agent-browser (dogfood), Playwright CLI, and Browser Harness (CDP). Use when automating browser interactions, testing web UI, taking screenshots, scraping data, filling forms, or performing any browser task. Triggers include "open a website", "test the UI", "take a screenshot", "fill a form", "click a button", "scrape data", "automate browser", "verify UI", "dogfood", "QA", or any task requiring programmatic web interaction with the AI Digital Life app.
---

# Browser Automation

Four complementary browser automation tools for AI Digital Life, with progressive disclosure.

## Quick Decision

| Scenario | Tool | Why |
|----------|------|-----|
| Full-featured terminal automation, JS eval, snapshot | **agent-browser** (dogfood) | Most complete CLI tool: `eval`, `find role`, `click`, `snapshot -i`, `console`, `record`, session management |
| Rapid iteration, no terminal setup | **MCP Playwright Tools** | Tool-call based, built into IDE, supports `evaluate` for dynamic DOM and in-app API calls |
| AI-driven exploration, coordinate clicks, self-healing | **Browser Harness** | Screenshot-first, `click_at_xy`, self-writing helpers, CDP to user's Chrome |
| Simple static screenshot | **Playwright CLI** | `playwright screenshot <url> <file>` for quick visual capture (interactive commands not available in installed version) |
| Need multiple approaches | **Combine all four** | agent-browser for robust terminal automation, MCP Playwright for rapid IDE iteration, Browser Harness for CDP-level access, Playwright CLI for static screenshots |

## Environment Setup

Different tools require different environment setup:

```powershell
# agent-browser (Recommended — works out of the box)
# No PATH setup needed — globally installed via npm
agent-browser --version

# Playwright CLI (static screenshot only)
# Interactive commands (click/fill/eval) NOT available in installed v1.59.1
$env:PATH = "D:\Program Files\nodejs;E:\dev-tools\npm-global;$env:PATH"
$env:PLAYWRIGHT_BROWSERS_PATH = "E:\dev-tools\playwright-browsers"

# Browser Harness (requires Chrome debug mode running)
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"
$env:BU_CDP_URL = "http://127.0.0.1:9222"
```

### Chrome Debug Mode (Browser Harness prerequisite)

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=E:\dev-tools\chrome-debug-profile"
```

### MCP Playwright Tools (IDE Built-in)

No environment setup needed. Tools are available as IDE function calls directly. See [MCP Playwright Tools](./references/mcp-playwright.md).

## Progressive Disclosure

This skill uses progressive disclosure. Start with the overview below, then load the detailed sub-skill when needed:

| Sub-skill | Load when | Content |
|-----------|-----------|---------|
| [agent-browser (dogfood)](./references/agent-browser.md) | Need full-featured terminal browser automation, JS eval, snapshot, console checks, or dogfood testing | Complete CLI reference, file tree workflow, workspace patterns, state verification |
| [MCP Playwright Tools](./references/mcp-playwright.md) | Need rapid browser interaction via IDE tool-calls, JS evaluation, or file tree testing | Available tools, workspace patterns, file tree navigation, in-app API calls |
| [Playwright CLI](./references/playwright-cli.md) | Need static page screenshots or reference documentation | Full command reference (reference only), project-specific selectors (limited capability) |
| [Browser Harness](./references/browser-harness.md) | Need AI-driven exploration, self-healing, or user's real Chrome | CDP commands, screenshot workflow, helpers, script-mode patterns |

**Load a sub-skill by reading its file** when the task falls into its domain. Load multiple when the task requires combining tools.

## Common Workflows

### Full File Tree Testing (agent-browser — Recommended)

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

### Full File Tree Testing (Browser Harness — Script Mode)

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

### Open Workspace & Test File Tree (MCP Playwright Tools)

**Best for**: Testing file explorer, file tree navigation, workspace operations.

```javascript
// Step 1: Navigate
mcp_Playwright_playwright_navigate("http://127.0.0.1:5173/");

// Step 2: Open workspace via in-app API (bypasses native OS dialog)
mcp_Playwright_playwright_evaluate(
  "window.digitalLife.workspace.open('E:\\\path\\\to\\\workspace')"
);

// Step 3: Click "文件" tab
mcp_Playwright_playwright_click("#_r_0_-files-tab");

// Step 4: Expand a directory by name
mcp_Playwright_playwright_evaluate(
  `(() => {
    const items = document.querySelectorAll('.adl-filetree__node--directory');
    for (const item of items) {
      if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') {
        item.querySelector('.adl-tree-node__toggle')?.click();
        break;
      }
    }
  })()`
);

// Step 5: Click a file inside expanded directory
mcp_Playwright_playwright_evaluate(
  `(() => {
    const items = document.querySelectorAll('.adl-filetree__node--directory');
    for (const item of items) {
      if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') {
        const files = item.querySelector('ul')?.querySelectorAll('li');
        if (files) for (const f of files) {
          if (!f.classList.contains('adl-filetree__node--directory')) {
            f.querySelector('.adl-tree-node__label')?.click();
            break;
          }
        }
        break;
      }
    }
  })()`
);

// Step 6: Verify with screenshot
mcp_Playwright_playwright_screenshot("file-opened");
```

### Open Workspace via Preview API (when native dialog blocks)

The "打开文件夹" menu item triggers a **native OS dialog** that Playwright cannot interact with.
Use the Vite Preview API directly instead of clicking the menu item:

```
POST http://localhost:5173/__adl_preview_api__/workspace/open
Body: {"workspacePath": "E:\\Programs\\Obsidian\\notes"}
```

Or via JS `evaluate`:
```javascript
mcp_Playwright_playwright_evaluate(
  "window.digitalLife.workspace.open('E:\\\\Programs\\\\Obsidian\\\\notes').then(r => JSON.stringify(r))"
);
```

### Test AI Digital Life UI (Playwright CLI — Static Screenshot Only)

```bash
# Capture a screenshot of the page (interactive commands not available)
playwright screenshot http://localhost:5173 screenshot.png
```

### Explore and Verify UI (Browser Harness)

```powershell
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"; $env:BU_CDP_URL = "http://127.0.0.1:9222"
browser-harness -c "new_tab('http://localhost:5173'); wait_for_load(); print(page_info())"
browser-harness -c "capture_screenshot()"
```

### Combined Workflow

1. Use **agent-browser** for the main automation workflow (open, eval, click, screenshot, console check)
2. Use **MCP Playwright Tools** for rapid IDE-based iteration and JS injection
3. Use **Browser Harness** for CDP-level access, coordinate clicks, or connecting to user's existing Chrome
4. Use **Playwright CLI** for quick static screenshots without session setup

## Tool Comparison

| Dimension | agent-browser (dogfood) | MCP Playwright Tools | Browser Harness | Playwright CLI |
|-----------|------------------------|---------------------|-----------------|---------------|
| Invocation | Terminal commands | IDE tool-calls | Terminal commands (Python DSL) | Terminal commands |
| Page understanding | Accessibility Tree (snapshot -i) | JS evaluate + Screenshot | Screenshot (visual) | Static screenshot only |
| Element targeting | ref / find role / CSS / eval | CSS selector / JS evaluate | Coordinate (x, y) clicks | ❌ Not available |
| JS evaluation | ✅ `eval` | ✅ Built-in (`evaluate` tool) | ✅ `js()` helper | ❌ Not available |
| Interactive click | ✅ `click`, `find role` | ✅ `click` tool | ✅ `click_at_xy` | ❌ Not available |
| Console/errors check | ✅ `console`, `errors` | ❌ Requires manual eval | ❌ Requires manual CDP | ❌ Not available |
| Accessibility snapshot | ✅ `snapshot -i` | ❌ | ❌ | ❌ Not available |
| Video recording | ✅ `record start/stop` | ❌ | ❌ | ❌ |
| Native OS dialog handling | ❌ Cannot interact—use workaround | ❌ Cannot interact—use workaround | ❌ Cannot interact—use workaround | ❌ |
| In-app API calls | ✅ Via `eval` | ✅ Via `evaluate` | ✅ Via `js()` | ❌ |
| Self-healing | No | No | Yes (writes missing helpers) | No |
| Cross-iframe/shadow DOM | Requires special handling | Requires `evaluate` or iframe tools | Automatic (compositor-level) | ❌ |
| Environment setup | None (globally installed) | None (built-in) | Chrome debug mode + `$env:BU_CDP_URL` | `$env:PATH` + `$env:PLAYWRIGHT_BROWSERS_PATH` |
| Token efficiency | High (~68 tokens) | Medium (tool-call overhead) | Lower (screenshot processing) | High (one-shot command) |

## Project-Specific Notes

- AI Digital Life runs on `http://localhost:5173` in browser dev mode
- Use `npm run dev:browser` from `E:\Programs\Obsidian\notes\ai-digital-life` to start
- For Tauri desktop mode, use `npm run dev:tauri`
- UI selectors are documented in `UIOperationManual/`
- The `ai-digital-life-ui-testing` skill provides project-specific selector strategies
- **Recommended tool**: `agent-browser` (dogfood) is the most capable and easiest to set up — use it as the default for browser automation tasks
- **File tree elements**: Use class names `.adl-filetree__node--directory`, `.adl-tree-node__label-text`, `.adl-tree-node__toggle` for DOM traversal — they are stable across sessions. File tree may need a refresh click after workspace open to trigger loading
- **Tool tab IDs**: `#_r_0_-files-tab` (文件), `#_r_0_-changes-tab` (变更) — stable within a session but may change on app restart. Use `find role tab click --name "文件"` for more stable targeting
- **Bypass native OS dialog**: All tools share the same limitation — the "打开文件夹" native dialog cannot be automated. Use `window.digitalLife.workspace.open("path")` via `eval`/`js()`/`evaluate` instead
- **PowerShell semicolons vs &&**: Use `;` (semicolons) to chain commands in PowerShell, not `&&`

## Related Skills

- **ai-digital-life-ui-testing**: Project-specific UI selectors and test patterns
- **dogfood**: Systematic exploratory testing to find bugs and UX issues — uses agent-browser under the hood
- **vitest-testing**: Unit testing patterns
- **playwright-best-practices**: General Playwright best practices (if installed)
- **run-project-surfaces**: Starting the app in different modes
