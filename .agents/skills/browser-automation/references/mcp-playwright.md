# MCP Playwright Tools Reference

Built-in browser automation tools via the MCP (Model Context Protocol), provided by the Trae IDE. Unlike Playwright CLI (terminal commands) and Browser Harness (CDP), MCP Playwright tools are **tool-call based** — invoked directly as IDE function calls.

## Available Tools

| Tool | Purpose |
|------|---------|
| `mcp_Playwright_playwright_navigate` | Navigate to a URL |
| `mcp_Playwright_playwright_click` | Click an element by CSS selector |
| `mcp_Playwright_playwright_fill` | Fill an input field |
| `mcp_Playwright_playwright_select` | Select a dropdown option |
| `mcp_Playwright_playwright_hover` | Hover over an element |
| `mcp_Playwright_playwright_screenshot` | Take a page/element screenshot |
| `mcp_Playwright_playwright_evaluate` | Execute JavaScript in browser |
| `mcp_Playwright_playwright_upload_file` | Upload a file |
| `mcp_Playwright_playwright_iframe_click` | Click element inside an iframe |
| `mcp_Playwright_playwright_iframe_fill` | Fill input inside an iframe |

## When to Use

| Scenario | Why MCP Playwright |
|----------|-------------------|
| Need precise CSS/locator-based element targeting | Supports standard CSS selectors and Playwright locators |
| Need to execute JavaScript in the browser | `evaluate` runs arbitrary JS and returns results |
| Simple click/fill/screenshot workflows | Minimal setup, no terminal environment needed |
| File tree or dynamic DOM interaction | Combine `click` with `evaluate` for complex navigation |
| Need to inject data via JS API (e.g. open workspace) | `evaluate` can call `window.digitalLife.*` API directly |

## Environment

No environment setup required — MCP Playwright tools use a **separate browser instance** managed by the IDE. You do NOT need `$env:PATH` or `$env:PLAYWRIGHT_BROWSERS_PATH` for these tools.

## Project-Specific: AI Digital Life

### Core Workflow Patterns

#### 1. Open Workspace via Preview API (Browser Mode)

In browser mode, the "打开文件夹" menu item triggers a **native OS dialog** (e.g. PowerShell `FolderBrowserDialog` on Windows) that cannot be automated by Playwright. Use the in-app API directly instead:

```javascript
// Via evaluate — opens workspace and returns metadata
const result = await page.evaluate(() =>
  window.digitalLife.workspace.open("E:\\Programs\\Obsidian\\notes")
    .then(r => JSON.stringify(r))
);
```

The Vite Preview API equivalent (used internally):

```
POST /__adl_preview_api__/workspace/open
Body: { "workspacePath": "E:\\Programs\\Obsidian\\notes" }
```

#### 2. File Tab Navigation

```javascript
// Click the "文件" tab by ID
await page.click("#_r_0_-files-tab");

// Verify file tree is rendered
const treeHTML = await page.evaluate(() =>
  document.querySelector('.adl-filetree-scroll')?.outerHTML?.substring(0, 500)
);
```

#### 3. Expand a Directory in File Tree

Use evaluate for complex DOM targeting (directories have dynamic indexing):

```javascript
// Click toggle button by directory name
await page.evaluate(() => {
  const items = document.querySelectorAll('.adl-filetree__node--directory');
  for (const item of items) {
    const text = item.querySelector('.adl-tree-node__label-text')?.textContent;
    if (text === 'docs') {      // or any directory name
      const toggle = item.querySelector('.adl-tree-node__toggle');
      if (toggle) toggle.click();
      break;
    }
  }
});

// Verify expansion
await page.evaluate(() => {
  const items = document.querySelectorAll('.adl-filetree__node--directory');
  for (const item of items) {
    if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') {
      return item.getAttribute('aria-expanded');  // "true" if expanded
    }
  }
});
```

#### 4. Click a File in File Tree

```javascript
// Click a file inside an expanded directory
await page.evaluate(() => {
  const items = document.querySelectorAll('.adl-filetree__node--directory');
  for (const item of items) {
    const text = item.querySelector('.adl-tree-node__label-text')?.textContent;
    if (text === 'docs') {
      const nestedUl = item.querySelector('ul');
      if (nestedUl) {
        const fileItems = nestedUl.querySelectorAll('li');
        for (const fileItem of fileItems) {
          if (!fileItem.classList.contains('adl-filetree__node--directory')) {
            const label = fileItem.querySelector('.adl-tree-node__label');
            if (label) label.click();
            break;
          }
        }
      }
    }
  }
});
```

#### 5. Switch Between Tool Tabs

```javascript
// Click by element ID (stable across sessions)
await page.click("#_r_0_-changes-tab");  // 变更 tab
await page.click("#_r_0_-files-tab");    // 文件 tab
```

### Complete Workflow: File Tree Testing

This is the full workflow executed and verified in a real test:

```
Step 1: Navigate to app
  → mcp_Playwright_playwright_navigate(url: "http://127.0.0.1:5173/")

Step 2: Open workspace via API (bypass native dialog)
  → mcp_Playwright_playwright_evaluate(
      script: 'window.digitalLife.workspace.open("E:\\Programs\\Obsidian\\notes")...'
    )

Step 3: Click "文件" tab
  → mcp_Playwright_playwright_click(selector: "#_r_0_-files-tab")

Step 4: Expand a directory (e.g. "docs")
  → mcp_Playwright_playwright_evaluate(
      script: '(<expand-directory script>)'
    )

Step 5: Click a file inside the directory
  → mcp_Playwright_playwright_evaluate(
      script: '(<click-file script>)'
    )

Step 6: Switch to "变更" tab
  → mcp_Playwright_playwright_click(selector: "#_r_0_-changes-tab")

Step 7: Switch back to "文件" tab, expand another dir, click another file
  → mcp_Playwright_playwright_click(selector: "#_r_0_-files-tab")
  → mcp_Playwright_playwright_evaluate(...)
```

### Verifying State

Always take a screenshot after each meaningful action:

```javascript
await page.screenshot();  // mcp_Playwright_playwright_screenshot
```

### Inspecting DOM Structure

Use evaluate to inspect live DOM when selectors are uncertain:

```javascript
// Check if a specific element exists
await page.evaluate(() => !!document.querySelector('.adl-filetree-scroll'));

// List all root-level tree items
await page.evaluate(() => {
  const items = document.querySelectorAll('.adl-filetree__node--directory');
  return Array.from(items).map(el => ({
    name: el.querySelector('.adl-tree-node__label-text')?.textContent,
    expanded: el.getAttribute('aria-expanded')
  }));
});

// Get full file tree HTML slice
await page.evaluate(() =>
  document.querySelector('.adl-filetree-scroll')?.outerHTML?.substring(0, 2000)
);
```

## Key Limitations

| Limitation | Workaround |
|------------|------------|
| Cannot interact with native OS dialogs (file picker, folder browser) | Use `window.digitalLife.workspace.open("path")` via `evaluate` |
| CSS selectors may fail on dynamically-generated IDs | Use `evaluate` with DOM traversal or text content matching |
| File tree items use stable class names but variable indices | Target by directory/file name text, not by index |
| Multiple sequential clicks may need waits between actions | Call `screenshot` between actions as implicit wait |
