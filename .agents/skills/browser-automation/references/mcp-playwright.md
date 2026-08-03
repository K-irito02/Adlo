# MCP Playwright 工具参考

> **⚠️ 当前环境不可用**：`mcp_Playwright_playwright_*` 系列工具在当前 Trae MCP 配置中**未启用**。当前环境可用的浏览器自动化方案为 [integrated_browser](./integrated-browser.md)（含 `browser_evaluate` 执行 JS）和 [agent-browser](./agent-browser.md)（终端 CLI）。
>
> 本文档保留作为参考：若你的 Trae 配置启用了 Playwright MCP 服务器，以下工具可用。

通过 MCP（Model Context Protocol）提供的浏览器自动化工具，由 Trae IDE 提供。与 Playwright CLI（终端命令）和 Browser Harness（CDP）不同，MCP Playwright 工具是**基于 tool call 的**——直接作为 IDE 函数调用。

## 可用工具

| 工具 | 用途 |
|------|------|
| `mcp_Playwright_playwright_navigate` | 导航到 URL |
| `mcp_Playwright_playwright_click` | 按 CSS 选择器点击元素 |
| `mcp_Playwright_playwright_fill` | 填充输入框 |
| `mcp_Playwright_playwright_select` | 选择下拉选项 |
| `mcp_Playwright_playwright_hover` | 悬停元素 |
| `mcp_Playwright_playwright_screenshot` | 页面/元素截图 |
| `mcp_Playwright_playwright_evaluate` | 在浏览器中执行 JS |
| `mcp_Playwright_playwright_upload_file` | 上传文件 |
| `mcp_Playwright_playwright_iframe_click` | 点击 iframe 内元素 |
| `mcp_Playwright_playwright_iframe_fill` | 填充 iframe 内输入框 |

## 何时使用

| 场景 | 为什么用 MCP Playwright |
|------|--------------------------|
| 需要精确的 CSS/locator 定位 | 支持标准 CSS 选择器和 Playwright locator |
| 需要在浏览器中执行 JS | `evaluate` 运行任意 JS 并返回结果 |
| 简单 click/fill/截图工作流 | 最小化设置，无需终端环境 |
| 文件树或动态 DOM 交互 | `click` 与 `evaluate` 组合进行复杂导航 |
| 通过 JS API 注入数据（如打开工作区） | `evaluate` 可直接调用 `window.digitalLife.*` API |

## 环境

无需环境配置 — MCP Playwright 工具使用 IDE 管理的**独立浏览器实例**。不需要 `$env:PATH` 或 `$env:PLAYWRIGHT_BROWSERS_PATH`。

## 项目应用：AI Digital Life

### 核心工作流模式

#### 1. 通过 Preview API 打开工作区（浏览器模式）

浏览器模式下，"打开文件夹"菜单项会触发**原生 OS 对话框**（Windows 上的 PowerShell `FolderBrowserDialog`），Playwright 无法自动化。请直接使用应用内 API：

```javascript
// 通过 evaluate — 打开工作区并返回元数据
const result = await page.evaluate(() =>
  window.digitalLife.workspace.open("E:\\AI-DIGITAL-LIFE\\SourceWorkspace")
    .then(r => JSON.stringify(r))
);
```

内部使用的 Vite Preview API 等价形式：

```
POST /__adl_preview_api__/workspace/open
Body: { "workspacePath": "E:\\AI-DIGITAL-LIFE\\SourceWorkspace" }
```

#### 2. 文件标签页导航

```javascript
// 按 ID 点击"文件"标签页
await page.click("#_r_0_-files-tab");

// 验证文件树已渲染
const treeHTML = await page.evaluate(() =>
  document.querySelector('.adl-filetree-scroll')?.outerHTML?.substring(0, 500)
);
```

#### 3. 展开文件树目录

动态索引的目录需用 evaluate 做复杂 DOM 定位：

```javascript
// 按目录名点击切换按钮
await page.evaluate(() => {
  const items = document.querySelectorAll('.adl-filetree__node--directory');
  for (const item of items) {
    const text = item.querySelector('.adl-tree-node__label-text')?.textContent;
    if (text === 'docs') {      // 或任意目录名
      const toggle = item.querySelector('.adl-tree-node__toggle');
      if (toggle) toggle.click();
      break;
    }
  }
});

// 验证展开状态
await page.evaluate(() => {
  const items = document.querySelectorAll('.adl-filetree__node--directory');
  for (const item of items) {
    if (item.querySelector('.adl-tree-node__label-text')?.textContent === 'docs') {
      return item.getAttribute('aria-expanded');  // 展开为 "true"
    }
  }
});
```

#### 4. 点击文件树中的文件

```javascript
// 点击已展开目录内的文件
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

#### 5. 切换工具标签页

```javascript
// 按元素 ID 点击（跨会话稳定）
await page.click("#_r_0_-changes-tab");  // 变更 标签页
await page.click("#_r_0_-files-tab");    // 文件 标签页
```

### 完整工作流：文件树测试

已在真实测试中执行并验证的完整工作流：

```
第 1 步：导航到应用
  → mcp_Playwright_playwright_navigate(url: "http://127.0.0.1:5173/")

第 2 步：通过 API 打开工作区（绕过原生对话框）
  → mcp_Playwright_playwright_evaluate(
      script: 'window.digitalLife.workspace.open("E:\\AI-DIGITAL-LIFE\\SourceWorkspace")...'
    )

第 3 步：点击"文件"标签页
  → mcp_Playwright_playwright_click(selector: "#_r_0_-files-tab")

第 4 步：展开目录（如 "docs"）
  → mcp_Playwright_playwright_evaluate(script: '(<展开目录脚本>)')

第 5 步：点击目录内文件
  → mcp_Playwright_playwright_evaluate(script: '(<点击文件脚本>)')

第 6 步：切换到"变更"标签页
  → mcp_Playwright_playwright_click(selector: "#_r_0_-changes-tab")

第 7 步：切回"文件"标签页，展开另一个目录，点击另一个文件
  → mcp_Playwright_playwright_click(selector: "#_r_0_-files-tab")
  → mcp_Playwright_playwright_evaluate(...)
```

### 状态验证

每次有意义操作后截图：

```javascript
await page.screenshot();  // mcp_Playwright_playwright_screenshot
```

### 检查 DOM 结构

选择器不确定时用 evaluate 检查实时 DOM：

```javascript
// 检查某元素是否存在
await page.evaluate(() => !!document.querySelector('.adl-filetree-scroll'));

// 列出所有根级树节点
await page.evaluate(() => {
  const items = document.querySelectorAll('.adl-filetree__node--directory');
  return Array.from(items).map(el => ({
    name: el.querySelector('.adl-tree-node__label-text')?.textContent,
    expanded: el.getAttribute('aria-expanded')
  }));
});

// 获取完整文件树 HTML 片段
await page.evaluate(() =>
  document.querySelector('.adl-filetree-scroll')?.outerHTML?.substring(0, 2000)
);
```

## 关键限制

| 限制 | 解决 |
|------|------|
| 无法交互原生 OS 对话框（文件选择器、文件夹浏览器） | 通过 `evaluate` 使用 `window.digitalLife.workspace.open("path")` |
| CSS 选择器在动态生成的 ID 上可能失效 | 用 `evaluate` 做 DOM 遍历或文本内容匹配 |
| 文件树节点类名稳定但索引可变 | 按目录/文件名文本定位，不要按索引 |
| 多次连续点击间可能需要等待 | 在动作间用 `screenshot` 作为隐式等待 |
