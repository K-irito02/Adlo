# Tauri 桌面模式浏览器功能修复计划（修订版）

## 问题重分析
根据用户反馈，使用 iframe 方案会有严重限制，很多主流网站打不开。**Tauri child WebView 才是正确的选择**，因为它能绕过 iframe 限制。

问题仅仅是 WebView 的边界控制不当，导致覆盖了整个窗口。

## 修复方案：修复 Tauri child WebView

### 优点
- ✅ 可以打开任何网站（不受 iframe 的 X-Frame-Options 限制）
- ✅ Tauri 原生体验更好
- ✅ 只需要修复边界问题，不需要大改架构

### 问题根源
从代码和文档分析，虽然我们的 `crates/browser/src/lib.rs` 中没有使用 `.auto_resize()`，但 WebView 的边界定位可能存在问题。

## 需要修改的文件

### 1. 前端：BrowserPanel.tsx
- 优化边界计算逻辑，确保 WebView 只在右侧面板区域显示
- 正确处理 DOM 元素的位置计算
- 确保 WebView 不会覆盖标题栏和其他 UI 元素

### 2. Rust 后端：确保 WebView 边界正确
- 保持现有代码（已经没有使用 auto_resize）
- 确保边界计算准确

## 具体实现步骤

### Step 1: 优化 BrowserPanel.tsx 中的边界计算
- 使用更准确的方式获取 DOM 元素的相对位置
- 确保 WebView 只在 `.adl-tool-primary--browser` 区域内
- 优化 resize 监听和更新机制

### Step 2: 确保"在外部浏览器打开"功能正常
- 在 Tauri 模式下引入并使用 Tauri Shell Plugin

### Step 3: 保持浏览器模式的 iframe 方案不变
- 浏览器模式继续使用 iframe 方案
- 双端保持各自最优的实现方案

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `BrowserPanel.tsx` | 优化 WebView 边界计算，确保正确定位 |
| `tauri-bridge.ts` | 添加 Tauri Shell Plugin 的 open 功能支持 |
| `Cargo.toml` 等配置 | 确保 Tauri Shell Plugin 已配置 |

这样，我们就能同时满足：
1. Tauri 模式可以打开任何网站
2. 不会覆盖 UI 元素
3. 保持良好的用户体验
