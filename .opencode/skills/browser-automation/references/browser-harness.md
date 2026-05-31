# Browser Harness Reference

Full command reference and project-specific usage for Browser Harness (v0.1.0).

## Installation

```powershell
# Already installed at:
# Package: E:\dev-tools\browser-harness\ (editable mode)
# Binary: E:\dev-tools\uv-bin\browser-harness

# Environment setup (run before each session)
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"
$env:BU_CDP_URL = "http://127.0.0.1:9222"
```

## Chrome Debug Mode (Required)

Browser Harness connects to your running Chrome via CDP. You MUST start Chrome in debug mode first:

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=E:\dev-tools\chrome-debug-profile"
```

Key points:
- Port 9222 must match `$env:BU_CDP_URL`
- `--user-data-dir` preserves login state between sessions
- Close all Chrome instances before starting debug mode
- Chrome 144+ will show a per-attach popup — click "Allow"

## Core Usage

### Basic Invocation

```powershell
browser-harness -c '<python code>'
```

The daemon auto-starts on first call. All helpers are pre-imported. No manual start/stop needed.

### Script Mode (For Complex Workflows)

For multi-step workflows, write a Python script file and execute it via `exec(open(...).read())`:

```powershell
browser-harness -c "exec(open('path/to/script.py').read())"
```

**Example script** (`file-tree-test.py`):

```python
import time

new_tab('http://127.0.0.1:5173/')
wait_for_load()
print("Step 1: Navigated")

# Use js() helper (not cdp()) for reliability — js() handles session attachment
js('window.digitalLife.workspace.open("E:/Programs/Obsidian/notes")')
time.sleep(2)
print("Step 2: Workspace opened")

# Use js() with DOM querySelector and optional chaining for clicks
js('document.querySelector("#_r_0_-files-tab")?.click()')
time.sleep(1)
print("Step 3: Files tab clicked")

# File tree operations via js() DOM traversal
js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "docs") { x.querySelector(".adl-tree-node__toggle")?.click(); break; } } })()')
time.sleep(1)
print("Step 4: Directory expanded")

js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "docs") { const f = x.querySelector("ul")?.querySelectorAll("li"); if (f) for (const y of f) { if (!y.classList.contains("adl-filetree__node--directory")) { y.querySelector(".adl-tree-node__label")?.click(); break; } } break; } } })()')
time.sleep(1)
print("Step 5: File clicked")
```

**Key insight**: Use `js()` rather than `cdp("Runtime.evaluate", ...)` for JS evaluation. The `js()` helper handles session ID attachment automatically, while raw `cdp()` calls require manual `session_id` parameter management which is error-prone.

### First Navigation

Always use `new_tab(url)` for the first navigation, not `goto_url(url)` — `goto` runs in the user's active tab and may overwrite their work.

```powershell
browser-harness -c "new_tab('http://localhost:5173'); wait_for_load(); print(page_info())"
```

## Core Helpers

### Navigation & Page Info

```python
new_tab("https://example.com")     # Open new tab with URL
goto_url("https://example.com")    # Navigate current tab (use after new_tab)
wait_for_load()                     # Wait for page to finish loading
page_info()                         # Returns {url, title, ...}
ensure_real_tab()                   # Re-attach if current tab is stale
```

### Screenshot Workflow (Primary Method)

Browser Harness uses a screenshot-first approach. The core workflow is:

```python
capture_screenshot()                # Take screenshot to understand page
click_at_xy(x, y)                  # Click at coordinates
capture_screenshot()                # Verify the click worked
```

**Why screenshots first?**
- `click_at_xy()` operates at Chrome's compositor level
- Automatically penetrates iframes, Shadow DOM, and cross-origin boundaries
- No selector hunting needed for visible elements
- Only drop to DOM when target has no visible geometry (hidden input, 0x0 node)

### Coordinate Clicks

```python
click_at_xy(x, y)                  # Left click at coordinates
# For right-click, double-click, etc., use raw CDP:
cdp("Input.dispatchMouseEvent", {
    "type": "mousePressed",
    "x": x, "y": y,
    "button": "right",
    "clickCount": 1
})
```

### DOM Operations

```python
js("document.title")                                    # Evaluate JS
js("document.querySelector('.adl-titlebar').textContent")  # Read element
js("el => el.textContent", element_ref)                 # With element reference
```

### Raw CDP (Escape Hatch)

For anything helpers don't cover:

```python
cdp("Domain.method", params_dict)    # Direct CDP protocol call
```

## Interaction Skills

Browser Harness provides guidance files for common UI mechanics. Check these when struggling:

| Skill | File | Covers |
|-------|------|--------|
| Connection | `interaction-skills/connection.md` | CDP connection troubleshooting |
| Cookies | `interaction-skills/cookies.md` | Cookie management |
| Cross-origin iframes | `interaction-skills/cross-origin-iframes.md` | Iframe handling |
| Dialogs | `interaction-skills/dialogs.md` | Alert/confirm/prompt |
| Downloads | `interaction-skills/downloads.md` | File downloads |
| Drag and drop | `interaction-skills/drag-and-drop.md` | Drag operations |
| Dropdowns | `interaction-skills/dropdowns.md` | Select/combobox |
| Iframes | `interaction-skills/iframes.md` | General iframe work |
| Network requests | `interaction-skills/network-requests.md` | HTTP interception |
| Print as PDF | `interaction-skills/print-as-pdf.md` | PDF generation |
| Profile sync | `interaction-skills/profile-sync.md` | Cloud profile management |
| Screenshots | `interaction-skills/screenshots.md` | Advanced screenshot usage |
| Scrolling | `interaction-skills/scrolling.md` | Scroll operations |
| Shadow DOM | `interaction-skills/shadow-dom.md` | Shadow DOM traversal |
| Tabs | `interaction-skills/tabs.md` | Tab management |
| Uploads | `interaction-skills/uploads.md` | File uploads |
| Viewport | `interaction-skills/viewport.md` | Viewport control |

## Self-Healing Mechanism

Browser Harness's most powerful feature. When the agent discovers a missing helper:

```
● agent: wants to upload a file
│
● agent-workspace/agent_helpers.py → helper missing
│
● agent writes it                    agent_helpers.py
│                                                    + custom helper
✓ file uploaded
```

The agent edits `agent-workspace/agent_helpers.py` to add the missing function, then continues. Over time, the helpers grow organically.

**Important**: Task-specific helpers go in `agent-workspace/agent_helpers.py`. Core helpers stay in `src/browser_harness/helpers.py` (protected).

## Domain Skills (Opt-in)

Community-contributed per-site playbooks. Disabled by default.

```powershell
$env:BH_DOMAIN_SKILLS = "1"    # Enable domain skills
```

When enabled, `goto_url` returns up to 10 skill filenames for the navigated host. Available skills include GitHub, LinkedIn, Amazon, etc.

## Remote Browsers (Browser Use Cloud)

For parallel sub-agents or headless deployment. Requires `BROWSER_USE_API_KEY`.

```python
start_remote_daemon("work")                                          # Clean browser
start_remote_daemon("work", profileName="my-work")                   # Reuse cloud profile
start_remote_daemon("work", proxyCountryCode="de", timeout=120)      # DE proxy, 2h timeout
start_remote_daemon("work", proxyCountryCode=None)                   # Disable proxy
```

Use with named session:

```powershell
$env:BU_NAME = "work"
browser-harness -c "new_tab('https://example.com'); print(page_info())"
```

## Bulk HTTP (For Static Pages)

When you don't need browser rendering:

```python
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor() as pool:
    results = list(pool.map(http_get, urls))
```

This can fetch 249 pages in ~2.8 seconds vs minutes with browser navigation.

## Design Constraints

- **Coordinate clicks default**: `Input.dispatchMouseEvent` goes through iframes/shadow/cross-origin at compositor level
- **Connect to user's Chrome**: Don't launch your own browser
- **No manager layer**: No retries framework, session manager, daemon supervisor, config system, or logging framework
- **Keep run.py tiny**: No argparse, subcommands, or extra control layer

## Gotchas (Field-Tested)

- Omnibox popups are fake page targets — filter `chrome://omnibox-popup...` when you need a real tab
- CDP target order != Chrome's visible tab-strip order
- Default daemon sessions can go stale — use `ensure_real_tab()` to re-attach
- After every meaningful action, re-screenshot before assuming it worked
- Prefer compositor-level actions over framework hacks
- Auth wall: if redirected to login, stop and ask the user — don't type credentials from screenshots

## Project-Specific: AI Digital Life

### Start App and Test

```powershell
# 1. Start Chrome debug mode
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=E:\dev-tools\chrome-debug-profile"

# 2. Start the app
cd E:\Programs\Obsidian\notes\ai-digital-life
npm run dev:browser

# 3. Set environment
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"
$env:BU_CDP_URL = "http://127.0.0.1:9222"

# 4. Open and test
browser-harness -c "new_tab('http://localhost:5173'); wait_for_load(); print(page_info())"
browser-harness -c "capture_screenshot()"
```

### Complete File Tree Testing Workflow (Script Mode)

Save this as `file-tree-test.py` and execute with `browser-harness -c "exec(open('file-tree-test.py').read())"`:

```python
import time

# Step 1: Navigate to app
new_tab('http://127.0.0.1:5173/')
wait_for_load()
print("Step 1: Navigated")

# Step 2: Open workspace via in-app API (bypasses native dialog)
js('window.digitalLife.workspace.open("E:/Programs/Obsidian/notes")')
time.sleep(2)
print("Step 2: Workspace opened")

# Step 3: Click "文件" tab
js('document.querySelector("#_r_0_-files-tab")?.click()')
time.sleep(1)
print("Step 3: Files tab clicked")

# Step 4: Click refresh button to trigger file tree loading
js('document.querySelector("[aria-label=刷新]")?.click()')
time.sleep(3)
print("Step 4: File tree refreshed")

# Step 5: Expand "docs" directory
js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "docs") { x.querySelector(".adl-tree-node__toggle")?.click(); break; } } })()')
time.sleep(1)
print("Step 5: docs expanded")

# Step 6: Click first file in docs
js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "docs") { const f = x.querySelector("ul")?.querySelectorAll("li"); if (f) for (const y of f) { if (!y.classList.contains("adl-filetree__node--directory")) { y.querySelector(".adl-tree-node__label")?.click(); break; } } break; } } })()')
time.sleep(1)
print("Step 6: File clicked")

# Step 7: Switch to "变更" tab
js('document.querySelector("#_r_0_-changes-tab")?.click()')
time.sleep(1)
print("Step 7: Changes tab clicked")

# Step 8: Switch back to "文件" tab
js('document.querySelector("#_r_0_-files-tab")?.click()')
time.sleep(1)
print("Step 8: Files tab back")

# Step 9: Expand "UIOperationManual" and click README.md
js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "UIOperationManual") { x.querySelector(".adl-tree-node__toggle")?.click(); break; } } })()')
time.sleep(1)

js('(() => { const i = document.querySelectorAll(".adl-filetree__node--directory"); for (const x of i) { if (x.querySelector(".adl-tree-node__label-text")?.textContent === "UIOperationManual") { const f = x.querySelector("ul")?.querySelectorAll("li"); if (f) for (const y of f) { const t = y.querySelector(".adl-tree-node__label-text")?.textContent; if (t === "README.md") { y.querySelector(".adl-tree-node__label")?.click(); break; } } break; } } })()')
time.sleep(1)
print("Step 9: README.md clicked - ALL DONE!")
```

### Gotchas Specific to Browser Harness

- **Use `js()` not `cdp()`** for clicks and DOM operations. `js()` automatically manages session IDs; `cdp()` may fail with `'code': -32600, 'message': "Message may have string 'sessionId' property"`.
- **Backslash escaping**: `js()` receives a Python string. Use forward slashes in paths: `js('window.digitalLife.workspace.open("E:/Programs/Obsidian/notes")')`.
- **Script mode** (`exec(open(...).read())`) is more reliable than inline `-c` for complex workflows — avoids quote escaping issues.
- **File tree may need refresh**: After opening a workspace, the file tree may not appear. Click the "刷新" (refresh) button first (`[aria-label=刷新]`).

### Common Operations

```powershell
# Navigate to app
browser-harness -c "new_tab('http://localhost:5173'); wait_for_load()"

# Take screenshot
browser-harness -c "capture_screenshot()"

# Get page info
browser-harness -c "print(page_info())"

# Click at coordinates (after screenshot reveals position)
browser-harness -c "click_at_xy(100, 200)"

# Read DOM
browser-harness -c "js('document.querySelector(\".adl-titlebar\").textContent')"
```
