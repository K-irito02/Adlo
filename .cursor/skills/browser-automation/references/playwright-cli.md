# Playwright CLI Reference

Full command reference and project-specific usage for Playwright CLI (v1.59.1).

> **⚠️ Version Limitation**: The locally installed version (v1.59.1 at `E:\dev-tools\npm-global`) only supports `open` (open browser) and `screenshot <url> <file>` (static page capture). Interactive commands like `click`, `fill`, `eval`, `snapshot`, `goto`, `press`, `tab-list`, etc. are **NOT available** in this version. The full reference below is provided for documentation purposes. For interactive automation, use **agent-browser** instead.

## Installation

```powershell
# Already installed at:
# Binary: E:\dev-tools\npm-global\playwright
# Browsers: E:\dev-tools\playwright-browsers\

# Environment setup (run before each session)
$env:PATH = "D:\Program Files\nodejs;E:\dev-tools\npm-global;$env:PATH"
$env:PLAYWRIGHT_BROWSERS_PATH = "E:\dev-tools\playwright-browsers"
```

> The interactive commands below (click, fill, eval, snapshot, etc.) are documented from the Playwright CLI 1.52+ specification. They are listed here as a reference — they are not available in the locally installed version.

## Core Commands

### Session Management

```bash
playwright open                                    # Open new browser
playwright open https://example.com/               # Open and navigate
playwright open --browser=chrome                   # Use specific browser
playwright open --browser=firefox
playwright open --browser=webkit
playwright open --browser=msedge
playwright open --persistent                       # Persistent profile
playwright open --profile=/path/to/profile         # Custom profile directory
playwright close                                   # Close browser
playwright list                                    # List all sessions
playwright close-all                               # Close all browsers
playwright kill-all                                # Force kill all browser processes
```

### Navigation

```bash
playwright goto https://playwright.dev
playwright go-back
playwright go-forward
playwright reload
```

### Element Interaction

```bash
# Click using ref from snapshot
playwright click e15

# Click using CSS selector
playwright click "#main > button.submit"

# Click using Playwright Locator (most robust)
playwright click "getByRole('button', { name: 'Submit' })"
playwright click "getByTestId('submit-button')"

# Double click
playwright dblclick e7

# Type text
playwright type "search query"

# Fill input (clears first, optionally submits)
playwright fill e5 "user@example.com"
playwright fill e5 "user@example.com" --submit

# Drag and drop
playwright drag e2 e8

# Hover
playwright hover e4

# Select dropdown option
playwright select e9 "option-value"

# File upload
playwright upload ./document.pdf

# Drop files onto element
playwright drop e4 --path=./image.png
playwright drop e4 --data="text/plain=hello world"

# Checkbox
playwright check e12
playwright uncheck e12
```

### Keyboard

```bash
playwright press Enter
playwright press ArrowDown
playwright press Tab
playwright keydown Shift
playwright keyup Shift
```

### Mouse

```bash
playwright mousemove 150 300
playwright mousedown
playwright mousedown right
playwright mouseup
playwright mouseup right
playwright mousewheel 0 100
```

### Dialogs

```bash
playwright dialog-accept
playwright dialog-accept "confirmation text"
playwright dialog-dismiss
```

### Viewport

```bash
playwright resize 1920 1080
```

## Page Inspection

### Snapshots

```bash
playwright snapshot                                # Default - save with timestamp
playwright snapshot --filename=after-click.yaml    # Save to specific file
playwright snapshot "#main"                        # Snapshot specific element
playwright snapshot --depth=4                      # Limit depth
playwright snapshot e34                            # Snapshot element by ref
playwright snapshot --boxes                        # Include bounding boxes
```

### JavaScript Evaluation

```bash
playwright eval "document.title"
playwright eval "el => el.textContent" e5
playwright eval "el => el.id" e5
playwright eval "el => el.getAttribute('data-testid')" e5
```

### Screenshots & PDF

```bash
playwright screenshot                              # Full page screenshot
playwright screenshot e5                           # Element screenshot
playwright screenshot --filename=page.png          # Custom filename
playwright pdf --filename=page.pdf                 # Save as PDF
```

## Tabs

```bash
playwright tab-list
playwright tab-new
playwright tab-new https://example.com/page
playwright tab-close
playwright tab-close 2
playwright tab-select 0
```

## Storage

### State

```bash
playwright state-save
playwright state-save auth.json
playwright state-load auth.json
```

### Cookies

```bash
playwright cookie-list
playwright cookie-list --domain=example.com
playwright cookie-get session_id
playwright cookie-set session_id abc123
playwright cookie-set session_id abc123 --domain=example.com --httpOnly --secure
playwright cookie-delete session_id
playwright cookie-clear
```

### LocalStorage

```bash
playwright localstorage-list
playwright localstorage-get theme
playwright localstorage-set theme dark
playwright localstorage-delete theme
playwright localstorage-clear
```

### SessionStorage

```bash
playwright sessionstorage-list
playwright sessionstorage-get step
playwright sessionstorage-set step 3
playwright sessionstorage-delete step
playwright sessionstorage-clear
```

## Network

```bash
# Mock responses
playwright route "**/*.jpg" --status=404
playwright route "https://api.example.com/**" --body='{"mock": true}'
playwright route-list
playwright unroute "**/*.jpg"
playwright unroute
```

## DevTools

```bash
playwright console                                 # View console messages
playwright console warning                         # Filter by level
playwright requests                                # View network requests
playwright request 5                               # View specific request
playwright run-code "async page => await page.context().grantPermissions(['geolocation'])"
playwright run-code --filename=script.js
```

## Tracing & Video

```bash
# Tracing
playwright tracing-start
playwright tracing-stop

# Video recording
playwright video-start video.webm
playwright video-chapter "Chapter Title" --description="Details" --duration=2000
playwright video-stop
```

## Debugging

```bash
# Interactive annotation
playwright show --annotate

# Generate Playwright locator for element
playwright generate-locator e5 --raw

# Highlight element
playwright highlight e5
playwright highlight e5 --style="outline: 3px dashed red"
playwright highlight e5 --hide
playwright highlight --hide
```

## Raw Output (for piping)

```bash
playwright --raw eval "JSON.stringify(performance.timing)"
playwright --raw eval "JSON.stringify([...document.querySelectorAll('a')].map(a => a.href))"
playwright --raw snapshot > before.yml
playwright --raw cookie-get session_id
playwright --raw localstorage-get theme
```

## Multi-Session

```bash
playwright -s=mysession open example.com --persistent
playwright -s=mysession click e6
playwright -s=mysession close
playwright -s=mysession delete-data
```

## Connect to Existing Browser

```bash
# Via Playwright Extension
playwright attach --extension=chrome

# Via CDP (Chrome/Edge)
playwright attach --cdp=chrome
playwright attach --cdp=msedge
playwright attach --cdp=http://localhost:9222
```

## Project-Specific: AI Digital Life

### Start App and Screenshot (Only Available Capability)

```powershell
# 1. Start the app
cd E:\Programs\Obsidian\notes\ai-digital-life
npm run dev:browser

# 2. Set environment
$env:PATH = "D:\Program Files\nodejs;E:\dev-tools\npm-global;$env:PATH"
$env:PLAYWRIGHT_BROWSERS_PATH = "E:\dev-tools\playwright-browsers"

# 3. Capture screenshot (this is the only interactive command available)
playwright screenshot http://localhost:5173 screenshot.png
```

### Capability Summary

| Operation | Status | Command |
|-----------|--------|---------|
| Open browser | ✅ Available | `playwright open http://localhost:5173` |
| Static screenshot | ✅ Available | `playwright screenshot <url> <file>` |
| Click element | ❌ Not available | Use agent-browser instead |
| JS evaluation | ❌ Not available | Use agent-browser `eval` instead |
| File tree navigation | ❌ Not available | Use agent-browser `eval` with DOM traversal |
| Accessibility snapshot | ❌ Not available | Use agent-browser `snapshot -i` |
| Console/errors check | ❌ Not available | Use agent-browser `console` / `errors` |
| Video recording | ❌ Not available | Use agent-browser `record start/stop` |

### File Tree Operations (Reference Only — Not Available)

The file tree operations below require `playwright eval` which is not available in the installed version. They are documented here for reference. Use **agent-browser** `eval` instead — the JS scripts are identical.```bash
# Title bar
playwright click "button[aria-label='主题']"
playwright click "button[aria-label='设置']"

# Composer
playwright fill "[data-testid='composer-input']" "Hello"
playwright click "[data-testid='composer-send']"

# Panels
playwright click "button[aria-label='切换左侧边栏']"
playwright click "button[aria-label='切换右侧面板']"
```

### File Tree Operations

The file tree uses dynamic IDs. Use `playwright eval` with JS DOM traversal for reliable targeting:

```bash
# Expand a directory by name
playwright eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') { item.querySelector('.adl-tree-node__toggle')?.click(); break; } } })()"

# Click a file inside expanded directory
playwright eval "(() => { const items = document.querySelectorAll('.adl-filetree__node--directory'); for (const item of items) { if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') { const files = item.querySelector('ul')?.querySelectorAll('li'); if (files) for (const f of files) { if (!f.classList.contains('adl-filetree__node--directory')) { f.querySelector('.adl-tree-node__label')?.click(); break; } } break; } } })()"

# List file tree root items
playwright eval "(() => { return JSON.stringify(Array.from(document.querySelectorAll('.adl-filetree__item')).map(el => ({ name: el.querySelector('.adl-tree-node__label-text')?.textContent, isDir: el.classList.contains('adl-filetree__node--directory'), expanded: el.getAttribute('aria-expanded') }))); })()"
```

### Switch Tool Tabs

```bash
# Click tool tab by role+name (most stable)
playwright click "getByRole('tab', { name: '文件' })"
playwright click "getByRole('tab', { name: '变更' })"

# Or by CSS selector
playwright click "#_r_0_-files-tab"
playwright click "#_r_0_-changes-tab"
```

### Open Workspace (Browser Mode — Bypass Native Dialog)

In browser mode, clicking "打开文件夹" from the File menu triggers a **native OS dialog** (PowerShell `FolderBrowserDialog` on Windows) that Playwright CLI cannot interact with. Use `playwright eval` to call the in-app API directly:

```bash
playwright eval "window.digitalLife.workspace.open('E:\\Programs\\Obsidian\\notes').then(r => JSON.stringify(r))"
```

The Vite Preview API equivalent:
```
POST /__adl_preview_api__/workspace/open
Body: {"workspacePath": "E:\\Programs\\Obsidian\\notes"}
```

### Running Playwright Tests

```powershell
cd E:\Programs\Obsidian\notes\ai-digital-life
$env:PATH = "D:\Program Files\nodejs;$env:PATH"
$env:PLAYWRIGHT_BROWSERS_PATH = "E:\dev-tools\playwright-browsers"
npx playwright test --headed
```

### When to Use agent-browser Instead

For workflows involving JS-heavy DOM navigation (file tree), in-app API calls (open workspace), or complex evaluate patterns, use **agent-browser** instead of Playwright CLI. It provides `eval`, `find role`, `snapshot -i`, `console`, and `errors` commands for full-featured browser automation. See [agent-browser Reference](./agent-browser.md) for details.
