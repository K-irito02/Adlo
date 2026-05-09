---
name: "ai-digital-life-ui-testing"
description: "AI Digital Life 项目 UI 自动化测试指南。包含项目特定的选择器定位策略、元素状态定义、等待条件模板，以及 Playwright CLI 和 Browser Harness 的项目专属操作命令。与 browser-automation 和 vitest-testing 技能配合使用。"
---

# AI Digital Life UI 自动化测试

本项目技能提供 AI Digital Life 桌面应用的 UI 自动化测试指导。

## 与通用技能的关系

| 技能 | 用途 | 与本技能的关系 |
|------|------|----------------|
| **本技能** | 项目特定的选择器和操作 | 提供项目特定的 UI 定位信息 |
| `browser-automation` | Playwright CLI + Browser Harness 工具参考 | 提供工具的完整命令参考 |
| `vitest-testing` | Vitest 单元测试模式 | 提供单元测试模式指导 |
| `run-project-surfaces` | 启动应用 | 提供应用启动方式 |

## 测试工具选择

| 场景 | 推荐工具 | 命令前缀 |
|------|----------|----------|
| 精确元素交互、E2E 测试 | Playwright CLI | `playwright` |
| AI 驱动探索、自愈工作流 | Browser Harness | `browser-harness -c` |
| 编写可重复测试脚本 | Playwright Test | `npx playwright test` |
| 单元/组件测试 | Vitest | `npm test` |

### 环境准备

```powershell
# Playwright CLI
$env:PATH = "D:\Program Files\nodejs;E:\dev-tools\npm-global;$env:PATH"
$env:PLAYWRIGHT_BROWSERS_PATH = "E:\dev-tools\playwright-browsers"

# Browser Harness（需先启动 Chrome 调试模式）
$env:PATH = "E:\dev-tools\uv-bin;$env:PATH"
$env:BU_CDP_URL = "http://127.0.0.1:9222"

# Chrome 调试模式（Browser Harness 前置条件）
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=E:\dev-tools\chrome-debug-profile"
```

## UI 操作手册

完整的 UI 操作手册位于 `notes/UIOperationManual/`，采用渐进式披露结构：

```
UIOperationManual/
├── README.md                    # 入口：布局概览 + 区域索引
├── _shared/                     # 共享定义
│   ├── selectors.md             # 选择器定位策略
│   ├── states.md                # 通用元素状态定义
│   └── wait-conditions.md       # 通用等待条件模板
├── titlebar/                    # 标题栏区域
├── leftbar/                     # 左侧边栏区域
├── center/                      # 中心面板区域
└── rightpanel/                  # 右侧面板区域
```

## 选择器定位策略

### 优先级顺序

| 优先级 | 类型 | 格式 | 示例 |
|--------|------|------|------|
| 1 | aria-label | `[aria-label="发送"]` | `button[aria-label="主题"]` |
| 2 | data-testid | `[data-testid="composer-send"]` | `[data-testid="composer-input"]` |
| 3 | role + name | `button[aria-label="发送"]` | `[role="tab"][aria-selected="true"]` |
| 4 | CSS 类名 | `.adl-action-btn--primary` | `.adl-titlebar` |

### 常用选择器速查

#### 标题栏

```typescript
const selectors = {
  titlebar: '.adl-titlebar',
  brand: '.adl-titlebar__brand',
  fileMenu: '.adl-menu[data-menu-id="file"]',
  themeBtn: 'button[aria-label="主题"]',
  langBtn: 'button[aria-label*="语言"]',
  settingsBtn: 'button[aria-label="设置"]',
  leftPanelToggle: 'button[aria-label="切换左侧边栏"]',
  rightPanelToggle: 'button[aria-label="切换右侧面板"]',
  minimizeBtn: 'button[aria-label="最小化"]',
  maximizeBtn: 'button[aria-label="最大化"]',
  closeBtn: 'button[aria-label="关闭"]',
};
```

#### 左侧边栏

```typescript
const selectors = {
  leftbar: '.adl-leftbar',
  quickActions: '.adl-leftbar__quick',
  workspaceList: '.adl-workspace-list',
  workspaceItem: '.adl-workspace-item',
  currentWorkspace: '.adl-workspace-item.is-current',
  sessionList: '.adl-session-list',
  sessionItem: '.adl-session-item',
  activeSession: '.adl-session-item.is-active',
};
```

#### 中心面板

```typescript
const selectors = {
  center: '.adl-center',
  messageStream: '.adl-message-stream',
  userMessage: '.adl-message--user',
  assistantMessage: '.adl-message--assistant',
  streamingMessage: '.adl-message--streaming',
  composer: '.adl-composer',
  composerInput: '[data-testid="composer-input"]',
  sendBtn: '[data-testid="composer-send"]',
};
```

#### 右侧面板

```typescript
const selectors = {
  rightpanel: '.adl-rightpanel',
  toolSwitcher: '.adl-tool-switcher',
  toolTab: '.adl-tool-switcher__tab',
  activeToolTab: '.adl-tool-switcher__tab.is-active',
  filesPanel: '#files-panel',
  changesPanel: '#changes-panel',
  terminalPanel: '#terminal-panel',
};
```

## 元素状态定义

### 会话状态灯

| 状态 | CSS 类名 | 颜色 | 说明 |
|------|----------|------|------|
| 处理中 | `.adl-status-lamp--processing` | 蓝色动画 | Agent 正在处理 |
| 待审批 | `.adl-status-lamp--pending-approval` | 橙色 | 等待用户审批 |
| 异常 | `.adl-status-lamp--abnormal` | 红色 | 执行出错 |
| 已完成 | `.adl-status-lamp--completed` | 绿色 | 正常完成 |
| 已读 | `.adl-status-lamp--read` | 灰色 | 已读状态 |

### 发送按钮状态

| 状态 | CSS 类名 | aria-label | 说明 |
|------|----------|------------|------|
| 可发送 | `.adl-action-btn--primary` | "发送" | 输入有内容 |
| 停止 | `.adl-action-btn--danger` | "停止生成" | 正在生成 |
| 重试 | `.adl-action-btn--warning` | "重试" | 发送失败 |
| 禁用 | `:disabled` | - | 输入为空 |

### 面板状态

| 状态 | CSS 类名 | 说明 |
|------|----------|------|
| 展开 | - | 默认状态 |
| 折叠 | `.adl-leftbar--collapsed` / `.adl-rightpanel--collapsed` | 隐藏内容 |
| 覆盖模式 | `.adl-rightpanel--overlay-active` | 覆盖中心区域 |

## 等待条件模板

### 消息流

```typescript
// 等待助手响应开始
await page.waitForSelector('.adl-message--assistant.adl-message--streaming');

// 等待助手响应完成
await page.waitForSelector('.adl-message--streaming', { state: 'hidden' });

// 等待新消息出现
const currentCount = await page.locator('.adl-message').count();
await page.waitForFunction(
  (count) => document.querySelectorAll('.adl-message').length > count,
  currentCount
);
```

### 面板状态

```typescript
// 等待左侧边栏折叠
await page.waitForSelector('.adl-leftbar--collapsed');

// 等待右侧面板展开
await page.waitForSelector('.adl-rightpanel:not(.adl-rightpanel--collapsed)');

// 等待工具面板激活
await page.waitForSelector('#files-panel.is-active');
```

### 菜单操作

```typescript
// 等待菜单打开
await page.waitForSelector('.adl-menu[data-menu-id="file"] .adl-menu__dropdown');

// 等待所有菜单关闭
await page.waitForSelector('.adl-menu__dropdown', { state: 'hidden' });
```

## Playwright CLI 项目专属操作

### 快速验证流程

```bash
# 1. 打开应用
playwright open http://localhost:5173
playwright snapshot

# 2. 验证布局
playwright click "getByRole('button', { name: '主题' })"
playwright screenshot --filename=theme-test.png

# 3. 测试发送消息
playwright fill "[data-testid='composer-input']" "测试消息"
playwright click "[data-testid='composer-send']"
playwright snapshot

# 4. 关闭
playwright close
```

### 常用 Playwright CLI 选择器映射

| 操作 | Playwright CLI 命令 |
|------|---------------------|
| 点击主题按钮 | `playwright click "button[aria-label='主题']"` |
| 点击设置按钮 | `playwright click "button[aria-label='设置']"` |
| 切换左侧边栏 | `playwright click "button[aria-label='切换左侧边栏']"` |
| 切换右侧面板 | `playwright click "button[aria-label='切换右侧面板']"` |
| 输入消息 | `playwright fill "[data-testid='composer-input']" "内容"` |
| 发送消息 | `playwright click "[data-testid='composer-send']"` |
| 读取页面标题 | `playwright eval "document.title"` |
| 检查主题状态 | `playwright eval "document.documentElement.getAttribute('data-theme')"` |

### 保存和恢复认证状态

```bash
# 登录后保存状态
playwright state-save adl-auth.json

# 下次直接恢复
playwright state-load adl-auth.json
```

## Browser Harness 项目专属操作

### 快速验证流程

```powershell
# 1. 打开应用
browser-harness -c "new_tab('http://localhost:5173'); wait_for_load(); print(page_info())"

# 2. 截图理解页面
browser-harness -c "capture_screenshot()"

# 3. 坐标点击（根据截图确定坐标）
browser-harness -c "click_at_xy(100, 200)"

# 4. 验证操作结果
browser-harness -c "capture_screenshot()"
```

### 常用 Browser Harness DOM 查询

```powershell
# 读取标题栏文本
browser-harness -c "js('document.querySelector("".adl-titlebar"").textContent')"

# 检查主题状态
browser-harness -c "js('document.documentElement.getAttribute(""data-theme"")')"

# 获取消息数量
browser-harness -c "js('document.querySelectorAll("".adl-message"").length')"

# 检查面板状态
browser-harness -c "js('document.querySelector("".adl-leftbar"").classList.contains(""adl-leftbar--collapsed"")')"
```

## Playwright Test 测试示例

### 基础 UI 测试

```typescript
import { test, expect } from '@playwright/test';

test('should display main layout', async ({ page }) => {
  await page.goto('/');
  
  await expect(page.locator('.adl-titlebar')).toBeVisible();
  await expect(page.locator('.adl-leftbar')).toBeVisible();
  await expect(page.locator('.adl-center')).toBeVisible();
  await expect(page.locator('.adl-rightpanel')).toBeVisible();
});

test('should toggle theme', async ({ page }) => {
  await page.goto('/');
  
  const themeBtn = page.locator('button[aria-label="主题"]');
  await themeBtn.click();
  
  await page.waitForFunction(() => {
    return document.documentElement.getAttribute('data-theme') !== null;
  });
});
```

### 发送消息测试

```typescript
test('should send message', async ({ page }) => {
  await page.goto('/');
  
  await page.fill('[data-testid="composer-input"]', '你好');
  await page.click('[data-testid="composer-send"]');
  
  await page.waitForSelector('.adl-message--user');
  await page.waitForSelector('.adl-message--assistant');
});
```

## 注意事项

1. **语言敏感性**：aria-label 值会随语言切换变化，建议使用部分匹配 `[aria-label*="发送"]`
2. **动态渲染**：菜单下拉、弹出框等是动态渲染的，需要等待出现后再操作
3. **异步加载**：文件树、会话列表等需要等待异步加载完成
4. **状态检查**：操作前检查元素是否可交互（非 disabled、非 loading）
5. **双端一致性**：所有 UI 测试必须在 Tauri 桌面和浏览器模式下分别验证
6. **Browser Harness 坐标**：坐标点击依赖页面布局，布局变化后坐标需重新确定
7. **Playwright CLI ref**：优先使用 snapshot 返回的 ref（如 `e15`），比 CSS 选择器更稳定

## 相关文档

- [UI 操作手册](../../../UIOperationManual/README.md)
- [选择器定位策略](../../../UIOperationManual/_shared/selectors.md)
- [元素状态定义](../../../UIOperationManual/_shared/states.md)
- [等待条件模板](../../../UIOperationManual/_shared/wait-conditions.md)
- [browser-automation 技能](../browser-automation/SKILL.md) — Playwright CLI + Browser Harness 完整命令参考
