# 浏览器空标签引导页 — 设计规范

## 概述

在"浏览器"功能面板下新增"默认系统级别的空标签引导页"，当没有活跃标签或活跃标签 URL 为空时出现。包含快捷导航、本地端口显示、自定义背景三大功能模块。

## 触发条件

```
showLandingPage = !hasActiveTab
  || !activeTab?.url
  || activeTab?.url === 'about:blank'
```

当 `showLandingPage` 为 `true` 时，主内容区渲染 `BrowserLandingPage` 替代原有的 iframe/WebView。

## 页面布局

### 层级结构

```
BackgroundLayer (最底层)
  └── 默认渐变背景 或 用户自定义图片/视频背景

前景内容层 (z-index 较高)
  ├── 快捷导航网格 (ShortcutGrid)
  ├── 本地端口区域 (LocalPortSection)
  ├── 底部工具栏
  │   ├── 「自定义背景」入口
  │   └── 「管理快捷站点」入口
  └── 弹窗层
      ├── AddShortcutDialog
      ├── RenameShortcutDialog
      └── BackgroundSettingsDialog
```

### 布局说明

- 页面顶部**不重复**搜索栏/地址栏和新建标签按钮（复用工具栏中的已有功能）
- 页面内容居中排列，左右留白
- 各区域按自然垂直流排列：快捷导航 → 本地端口
- 底部固定显示「自定义背景」和「管理快捷站点」入口

## 快捷导航 (ShortcutGrid)

### 类型定义

```typescript
interface ShortcutSite {
  id: string;
  name: string;
  url: string;
  icon?: string;
  sortOrder: number;
  createdAt: number;
}
```

### 显示

- 网格卡片式布局，默认 5 列
- 每张卡片包含圆形图标区域 + 站点名称
- 末尾显示虚线 "+" 占位卡片，点击弹出添加快捷站点对话框
- 网格上方显示 `⭐ 快捷导航` 标题和 `+ 添加快捷站点` 操作入口

### 交互

| 操作 | 行为 |
|------|------|
| 左键点击卡片 | 在浏览器中打开该 URL（新建标签或导航到当前标签） |
| 右键点击卡片 | 弹出上下文菜单（复用 ContextMenu 组件） |
| 拖拽卡片 | 通过 HTML5 Drag & Drop API 重排序，更新 `sortOrder` |
| 右键 → 重命名 | 弹出 RenameShortcutDialog |
| 右键 → 删除 | 删除该快捷站点 |

### 右键菜单项

- 重命名（弹出对话框）
- 删除（红色）

### 添加快捷站点对话框 (AddShortcutDialog)

- 站点名称（必填）
- 站点网址（必填，自动补全 `https://` 前缀）
- "取消"和"添加"按钮使用 `grid-template-columns: 1fr 1fr` 均匀铺满底部
- 点击弹窗外部区域关闭

### 重命名对话框 (RenameShortcutDialog)

- 复用与添加快捷站点相同的对话框样式
- 标题："重命名快捷站点"
- 预填当前站点名称
- "取消"和"保存"按钮均匀铺满底部

### 存储

- localStorage key: `browser-shortcuts`
- 复用 `hydrateBrowserDefaults` + `scheduleWrite` (50ms debounce) 机制

## 本地端口 (LocalPortSection)

### 类型定义

```typescript
interface LocalPort {
  id: string;
  host: string;
  port: number;
  label?: string;
  isAutoDiscovered: boolean;
  lastAliveAt: number;
  sortOrder: number;
}
```

### 显示

- 标题行: 🔌 本地端口 + [刷新按钮] + 辅助文字"首次自动扫描 · 点击刷新重新扫描"
- 端口以卡片形式横向排列，每个卡片包含：
  - 绿色圆点（存活状态指示器）
  - 端口地址：`localhost:端口号`
  - 标签：自动识别或用户自定义（如 "Vite"、"Next.js"）
- 末尾显示虚线 "+" 手动添加占位卡片

### 交互

| 操作 | 行为 |
|------|------|
| 点击端口卡片 | 在浏览器中打开该端口 URL |
| 拖拽端口卡片 | 通过 HTML5 Drag & Drop API 重排序 |
| 点击刷新按钮 | 手动触发重新扫描 |
| 点击 "+ 手动添加" | 弹出手动添加端口对话框 |

### 扫描逻辑

- 首次进入空标签引导页时自动触发端口扫描
- 扫描范围：常见开发端口（3000, 5173, 8000, 8080, 9000 等）
- 浏览器模式：通过 `fetch` 探测（受同源策略限制）
- Tauri 模式：可通过 Rust 后端 TCP 探测完整范围
- 刷新按钮：用户可随时手动触发重新扫描

### 存储

- localStorage key: `browser-local-ports`
- 手动添加的端口与自动扫描的端口使用同一列表管理

## 背景系统 (BackgroundLayer)

### 默认背景

- 纯 CSS 实现，通过 `[data-theme]` 选择器自动切换
- 浅色主题: `linear-gradient(135deg, #f5f7fa, #c3cfe2)` —— 柔和的灰白渐变
- 深色主题: `linear-gradient(135deg, #0a0a0a 0%, #2a2a2a 50%, #121212 100%)` —— 炫酷高级感的黑灰渐变
- 零 JavaScript 开销

### 自定义背景

#### 类型定义

```typescript
type BackgroundMode = 'default' | 'image' | 'video';
type BackgroundFit = 'cover' | 'contain' | 'repeat';

interface BackgroundConfig {
  mode: BackgroundMode;
  filePath?: string;
  fit: BackgroundFit;
  fileName?: string;
}
```

#### 背景设置对话框 (BackgroundSettingsDialog)

- 背景模式选择（分段控件）：默认 / 图片 / 视频
- 文件上传区域：点击选择或拖拽上传，支持 JPG、PNG、GIF、MP4、WebM
- 实时预览区域
- 背景填充选项：铺满 (cover) / 适应 (contain) / 平铺 (repeat)
- 「重置为默认」按钮：一键恢复系统渐变背景
- 「应用」按钮：确认更改

#### 存储

- localStorage key: `browser-bg-config`
- 图片/视频文件路径保存到 localStorage，文件本体保存到应用数据目录

## Zustand Slice 扩展

向现有的 `BrowserSlice` 接口新增以下状态和方法：

```typescript
interface BrowserSlice {
  // 新增状态
  browserShortcuts: ShortcutSite[];
  browserLocalPorts: LocalPort[];
  browserBgConfig: BackgroundConfig;
  browserPortScanning: boolean;

  // 快捷站点方法
  browserAddShortcut(site: ShortcutSite): void;
  browserRenameShortcut(id: string, name: string): void;
  browserDeleteShortcut(id: string): void;
  browserReorderShortcuts(ids: string[]): void;

  // 本地端口方法
  browserSetLocalPorts(ports: LocalPort[]): void;
  browserAddManualPort(port: number, label?: string): void;
  browserDeleteLocalPort(id: string): void;
  browserReorderLocalPorts(ids: string[]): void;
  browserSetPortScanning(scanning: boolean): void;

  // 背景配置方法
  browserSetBgConfig(config: BackgroundConfig): void;
  browserResetBgConfig(): void;
}
```

## 组件架构

```
features/browser/browser-landing/
  ├── index.ts
  ├── BrowserLandingPage.tsx       # 主容器
  ├── BrowserLandingPage.css
  ├── ShortcutGrid.tsx             # 快捷导航网格
  ├── ShortcutCard.tsx             # 快捷站点卡片
  ├── ShortcutGrid.css
  ├── LocalPortSection.tsx         # 本地端口区域
  ├── LocalPortCard.tsx            # 本地端口卡片
  ├── LocalPortSection.css
  ├── BackgroundLayer.tsx          # 背景层
  ├── BackgroundLayer.css
  ├── BackgroundSettingsDialog.tsx # 背景设置弹窗
  ├── BackgroundSettingsDialog.css
  ├── AddShortcutDialog.tsx        # 添加快捷站点弹窗
  └── RenameShortcutDialog.tsx     # 重命名弹窗
```

### 修改的现有文件

- `features/browser/browserpanel.tsx` — 新增 `showLandingPage` 判断，渲染 `BrowserLandingPage`
- `features/browser/useBrowserPanel.ts` — 新增空状态判断逻辑
- `app/stores/slices/browserSlice.ts` — 扩展 `BrowserSlice` 接口 + 实现新增方法 + 新增 localStorage keys
- `app/stores/StoreState.ts` — 合并扩展后的 `BrowserSlice`（自动继承）
- `features/browser/index.ts` — 导出新增组件

### 复用的基础设施

- ContextMenu 组件（右键菜单）
- TooltipSimple 组件（提示）
- 设计 Token 系统（间距、圆角、阴影、颜色变量）
- CSS 主题变量（`[data-theme]` 选择器）
- Zustand hydrate/scheduleWrite 持久化机制
- HTML5 Drag & Drop API

## 实现排期建议

### Phase 1: 核心框架 + 快捷导航
- BrowserLandingPage 主容器 + 显示条件
- BackgroundLayer（默认渐变背景）
- ShortcutGrid + ShortcutCard（含拖拽排序）
- AddShortcutDialog + RenameShortcutDialog

### Phase 2: 本地端口
- LocalPortSection + LocalPortCard（含拖拽排序）
- 端口扫描逻辑
- 手动添加端口功能

### Phase 3: 自定义背景
- BackgroundSettingsDialog
- 文件上传与预览
- 背景填充选项
- 重置为默认
