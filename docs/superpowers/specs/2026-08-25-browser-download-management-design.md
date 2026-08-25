# Browser Download Management — Design Spec

> **Date:** 2026-08-25
> **Status:** Approved
> **Scope:** WebView2 下载管理功能 — 工具栏下载按钮、Edge 风格菜单卡片、设置页下载设置、危险色标准化、图标替换

---

## 1. Background & Problem

### Current State

- WebView2 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 中 `msWebOOUI` 被禁用，抑制了原生下载 UI
- WRY 层有 `download_handler` 基础设施但未被 ADL 接线
- 前端/后端均无任何 download 相关事件、命令、UI
- 右键 WebView2 → "下载/另存为" 可触发系统下载对话框（部分路径有效）
- 点击网页下载按钮无响应（无对话框、无实际下载）

### Goal

实现完整的浏览器下载管理系统，包括：
1. 拦截 WebView2 下载事件，接管下载流程
2. 工具栏下载按钮（含圆形进度环）
3. Edge 风格下载菜单卡片（搜索、进度、历史、设置）
4. 浏览器设置页下载设置
5. 统一项目危险色为 `#e9967a`（rgb 233, 150, 122）
6. 替换所有 `IconTrash` 为新删除图标

### Approach

**方案 C（混合方案）：** WebView2 事件拦截 + 自定义 UI

- 利用 WebView2 `DownloadStarting` 事件拦截下载
- 设置 `Handled = true` 隐藏原生对话框
- 使用 WebView2 内置的 `BytesReceivedChanged` / `StateChanged` 追踪进度
- 不使用 reqwest 重新下载（复用 Chromium 网络栈、连接池、Cookie/认证）

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  WebView2 (child browser tab)                               │
│  用户点击下载链接 / 右键"另存为"                               │
│         ↓                                                   │
│  Chromium Network Stack（自动处理 HTTP、Cookie、认证）         │
│         ↓                                                   │
│  DownloadStarting 事件                                       │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│  WRY/Tauri Layer（Rust）                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ download_handler.rs                                 │    │
│  │ • 监听 DownloadStarting 事件                         │    │
│  │ • 设置 Handled = true（隐藏原生对话框）               │    │
│  │ • 根据模式决定路径（自动/询问）                        │    │
│  │ • 订阅 BytesReceivedChanged / StateChanged           │    │
│  └─────────────────────────────────────────────────────┘    │
│         ↓                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ download_manager.rs                                 │    │
│  │ • 管理所有下载任务的状态                              │    │
│  │ • 下载记录持久化到 SQLite                             │    │
│  │ • 文件名冲突处理（自动重命名）                        │    │
│  │ • 磁盘空间检查                                       │    │
│  └─────────────────────────────────────────────────────┘    │
│         ↓ (Tauri Events)                                    │
│  browser-download-started / progress / completed / error     │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React/Zustand)                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ browserDownloadsSlice.ts                            │    │
│  │ • downloads[] / activeDownloads / settings           │    │
│  └─────────────────────────────────────────────────────┘    │
│         ↓                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ BrowserDownloadButton.tsx   ← 工具栏按钮+进度环      │    │
│  │ BrowserDownloadMenu.tsx     ← Edge 风格菜单卡片      │    │
│  │ BrowserDownloadItem.tsx     ← 单条下载记录           │    │
│  │ BrowserDownloadSettings.tsx ← 设置页下载设置         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

| 事件 | 方向 | 载荷 |
|------|------|------|
| `browser-download-started` | Backend → Frontend | `{ id, url, fileName, totalBytes, mimeType }` |
| `browser-download-progress` | Backend → Frontend | `{ id, bytesReceived, speed, estimatedEndTime }` |
| `browser-download-completed` | Backend → Frontend | `{ id, filePath, totalBytes }` |
| `browser-download-error` | Backend → Frontend | `{ id, reason, canRetry }` |
| `browser_download_start` | Frontend → Backend | `{ url, fileName? }` |
| `browser_download_cancel` | Frontend → Backend | `{ id }` |
| `browser_download_pause` | Frontend → Backend | `{ id }` |
| `browser_download_resume` | Frontend → Backend | `{ id }` |

---

## 3. Backend Design (Rust)

### 3.1 Data Models

```rust
// crates/browser/src/download_types.rs

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
    InProgress,
    Completed,
    Failed,
    Paused,
    Canceled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub file_name: String,
    pub file_path: String,
    pub total_bytes: Option<u64>,
    pub bytes_received: u64,
    pub mime_type: Option<String>,
    pub status: DownloadStatus,
    pub interrupt_reason: Option<String>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub source_tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadSettings {
    pub mode: DownloadMode,
    pub default_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadMode {
    Auto,
    Ask,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub id: String,
    pub bytes_received: u64,
    pub speed: u64,
    pub estimated_end_time: Option<f64>,
}
```

### 3.2 SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS download_history (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    total_bytes INTEGER,
    bytes_received INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress',
    interrupt_reason TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    source_tab_id TEXT
);

CREATE INDEX idx_download_history_created ON download_history(created_at);
CREATE INDEX idx_download_history_status ON download_history(status);
```

### 3.3 Core Modules

**`download_handler.rs` — WebView2 事件接线：**

在 `build_webview_builder()` 中添加 `.with_download_started_handler()`：
- 监听 DownloadStarting 事件
- 设置 `Handled = true` 隐藏原生对话框
- 检查磁盘空间 → 不足则取消下载并通知前端
- 根据下载模式决定路径（Auto: 直接保存 / Ask: 弹出 SaveFileDialog）
- 处理文件名冲突（自动重命名 `(1)`, `(2)`, ...）
- 创建下载记录，通知前端
- 订阅 `BytesReceivedChanged` / `StateChanged` 事件

**`download_manager.rs` — 下载管理器核心：**

| 方法 | 功能 |
|------|------|
| `check_disk_space(path)` | 检查目标目录可用空间，< 10MB 警告 |
| `resolve_conflict_path(suggested)` | Chrome/Edge 风格自动重命名 |
| `create_download(url, path)` | 创建记录，插入 SQLite |
| `update_progress(id, bytes, speed)` | 更新实时进度 |
| `complete_download(id, success, reason)` | 标记完成/失败 |
| `clear_history()` | 清空历史（不删文件） |
| `delete_file_and_record(id)` | 删除文件 + 移除记录 |
| `remove_record(id)` | 仅移除记录 |
| `get_settings()` / `update_settings()` | 读写下载设置 |
| `list_downloads()` | 获取所有下载记录 |

**`download_commands.rs` — Tauri 命令：**

| 命令 | 功能 |
|------|------|
| `browser_download_start` | 开始下载 |
| `browser_download_cancel` | 取消下载 |
| `browser_download_pause` | 暂停下载 |
| `browser_download_resume` | 恢复下载 |
| `browser_download_list` | 获取下载记录 |
| `browser_download_clear_history` | 清空历史 |
| `browser_download_delete_file` | 删除文件 |
| `browser_download_remove_record` | 移除记录 |
| `browser_download_get_settings` | 获取设置 |
| `browser_download_update_settings` | 更新设置 |
| `browser_download_open_folder` | 打开下载文件夹 |
| `browser_download_show_in_folder` | 在文件夹中显示 |
| `browser_download_open_file` | 打开文件 |

### 3.4 Default Download Path Strategy

```rust
fn get_default_download_path() -> PathBuf {
    // 1. 优先使用非 C 盘的"下载"文件夹
    // 2. 回退到用户目录下的"Downloads"
    // 3. 最终回退：应用专属目录 ai-digital-life/downloads/
}
```

---

## 4. Frontend Design (TypeScript/React)

### 4.1 Store Slice

```typescript
// frontend/src/app/stores/slices/browserDownloadsSlice.ts

interface DownloadItem {
  id: string;
  url: string;
  fileName: string;
  filePath: string;
  totalBytes: number | null;
  bytesReceived: number;
  mimeType: string | null;
  status: 'in_progress' | 'completed' | 'failed' | 'paused' | 'canceled';
  interruptReason: string | null;
  createdAt: number;
  completedAt: number | null;
  sourceTabId: string | null;
  speed?: number;
  estimatedEndTime?: number;
}

interface BrowserDownloadsState {
  downloads: DownloadItem[];
  settings: { mode: 'auto' | 'ask'; defaultPath: string };
  isOpen: boolean;
}

interface BrowserDownloadsActions {
  initializeDownloads: () => Promise<void>;
  startDownload: (url: string, fileName?: string) => Promise<void>;
  cancelDownload: (id: string) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  clearHistory: () => void;
  deleteFile: (id: string) => void;
  removeRecord: (id: string) => void;
  updateSettings: (settings: Partial<BrowserDownloadsState['settings']>) => void;
  setOpen: (open: boolean) => void;
  handleDownloadStarted: (record: DownloadItem) => void;
  handleDownloadProgress: (progress: { id: string; bytesReceived: number; speed: number }) => void;
  handleDownloadCompleted: (result: { id: string; filePath: string }) => void;
  handleDownloadError: (error: { id: string; reason: string }) => void;
}
```

### 4.2 Components

**BrowserDownloadButton.tsx — 工具栏下载按钮：**

| 状态 | 图标 | 交互 |
|------|------|------|
| 无下载 | 简化向下箭头（IconDownload） | 点击打开菜单卡片 |
| 下载中 | 箭头 + 圆形进度环（SVG stroke-dasharray 动画） | 点击打开菜单卡片 |
| 下载完成 | 箭头 + 短暂 checkmark 动画（1.5s 后消失） | 点击打开菜单卡片 |
| 下载失败 | 箭头 + 红色 error 小圆点 | 点击打开菜单卡片 |

圆形进度环实现：
```tsx
<svg width="16" height="16" viewBox="0 0 16 16">
  <circle cx="8" cy="8" r="6" fill="none" stroke="var(--border)" strokeWidth="2" />
  <circle cx="8" cy="8" r="6" fill="none" stroke="var(--primary)" strokeWidth="2"
    strokeDasharray={2 * Math.PI * 6}
    strokeDashoffset={2 * Math.PI * 6 * (1 - progress)}
    transform="rotate(-90 8 8)" />
  <path d="M8 4v5M5.5 7.5L8 10l2.5-2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
</svg>
```

**BrowserDownloadMenu.tsx — Edge 风格菜单卡片：**

```
┌─────────────────────────────────────────────────────┐
│ 🔍 搜索下载记录...                    [自动保存 ⏏]  │  ← 顶部栏
├─────────────────────────────────────────────────────┤
│ 进行中 ↓                                            │  ← 分区标题
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📄 large-file.zip                  45%  12.3MB  │ │
│ │ ████████████░░░░░░░░░░░░░░░░░░░░  2.8MB/s     │ │
│ └─────────────────────────────────────────────────┘ │
│ 已完成 ↓                                            │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📄 image.png                      ✅  2.1MB    │ │
│ │ 📄 document.pdf                   ✅  5.4MB    │ │
│ └─────────────────────────────────────────────────┘ │
│ 失败 ↓                                              │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ❌ broken-link.zip               ⚠  网络中断    │ │
│ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ [⚙下载设置]  [🗑清空历史]  [📁打开文件夹]           │  ← 底部工具栏
└─────────────────────────────────────────────────────┘
```

**BrowserDownloadItem.tsx — 单条下载记录：**

悬停时显示操作按钮：
```
┌─────────────────────────────────────────────────┐
│ 📄 image.png                      ✅  2.1MB    │
│                                    [📁] [🗑]    │
└─────────────────────────────────────────────────┘
```

右键菜单（ContextMenu）：
```
┌─────────────────────────────┐
│ 打开文件                    │
│ 在文件夹中显示              │
│ ─────────────────────────── │
│ 删除真实文件                │  ← danger 样式
│ 从下载历史记录中移除        │
│ ─────────────────────────── │
│ 复制下载链接                │
└─────────────────────────────┘
```

**BrowserDownloadSettings.tsx — 设置页下载设置：**

复用 `BrowserPerformanceSettings` 布局模式，包含：
- 默认保存路径（路径选择器 + 浏览按钮）
- 下载行为（下拉选择：自动保存 / 每次询问）

### 4.3 Toolbar Layout Change

```
当前：  [导航] [地址栏] [搜索引擎⚙] [菜单☰]
修改后：[导航] [地址栏] [搜索引擎⚙] [下载⏬] [菜单☰]
```

在 `BrowserToolbar.tsx` 的 `adl-tool-context__group--files-actions` 中，搜索引擎按钮和菜单按钮之间插入下载按钮。

### 4.4 Event Listener Hook

```typescript
// useBrowserDownloads.ts
// 监听 Tauri 事件：browser-download-started / progress / completed / error
```

---

## 5. UI/UX Design

### 5.1 Empty State

```
┌─────────────────────────────────────────────┐
│ 🔍 搜索下载记录...                    [自动保存 ⏏] │
├─────────────────────────────────────────────┤
│          📥                                  │
│      暂无下载记录                             │
├─────────────────────────────────────────────┤
│ [⚙下载设置]  [📁打开文件夹]                   │
└─────────────────────────────────────────────┘
```

### 5.2 Progress Formatting

| 数据 | 格式 | 示例 |
|------|------|------|
| 文件大小 | `formatBytes()` | 1.2 MB, 3.4 GB |
| 下载速度 | `formatSpeed()` | 2.8 MB/s, 456 KB/s |
| 剩余时间 | `formatETA()` | 2 分钟后完成, 少于 1 分钟 |
| 百分比 | 整数 | 45%, 100% |

### 5.3 CSS Constraints

| 属性 | 值 |
|------|------|
| 菜单宽度 | 380px |
| 菜单最大高度 | 480px（超出滚动） |
| 圆角 | `var(--radius)` |
| 阴影 | `var(--shadow)` |
| 颜色 | CSS 自定义属性 `var(--…)` |
| 过渡动画 | 150ms ease-in-out |
| 菜单入场 | 淡入 + 微上移 |

---

## 6. Icons & Color Standard

### 6.1 Danger Color Standard

**目标：** `#e9967a`（rgb 233, 150, 122）为项目唯一危险/错误标准色。

**Token 变更（`themes.css`）：**

| 变量 | 亮主题旧值 | 暗主题旧值 | 新值（双主题统一） |
|------|-----------|-----------|------------------|
| `--danger` | `#dc2626` | `#f87171` | `#e9967a` |
| `--color-danger` | `#dc2626` | `#f87171` | `#e9967a` |
| `--danger-soft` | `rgba(220,38,38,0.1)` | `rgba(248,113,113,0.15)` | `rgba(233,150,122,0.12)` |
| `--danger-subtle` | `rgba(220,38,38,0.06)` | `rgba(248,113,113,0.08)` | `rgba(233,150,122,0.08)` |
| `--danger-muted` | `#e9967a` | `#e9967a` | `#e9967a`（不变） |
| `--error-toast-error` | `#dc2626` | `#eb7153` | `#e9967a` |
| `--ring-error` | `rgba(239,68,68,0.25)` | `rgba(239,68,68,0.35)` | `rgba(233,150,122,0.3)` |

**硬编码回退值修复清单：**

| 文件 | 行号 | 旧回退值 | 新回退值 |
|------|------|---------|---------|
| `composer-input.css` | 211, 217 | `#ef4444` | `#e9967a` |
| `composer-core.css` | 230, 234, 241 | `#ef4444` | `#e9967a` |
| `settings.css` | 918, 937 | `rgba(239,68,68,0.1)` | `rgba(233,150,122,0.12)` |
| `cmTheme.ts` | 412 | `#f87171` | `#e9967a` |
| `cmTheme.ts` | 222 | `rgba(248,113,113,0.12)` | `rgba(233,150,122,0.12)` |
| `gutterHoverSync.ts` | 104 | `rgba(239,68,68,0.35)` | `rgba(233,150,122,0.35)` |
| `useBklitTheme.ts` | 25, 37 | `#ef4444` / `#f87171` | `#e9967a` |
| 7 个测试文件 | seriesColors | `#ef4444` | `#e9967a` |

**不变更的特殊用途色：**

| 变量 | 值 | 理由 |
|------|-----|------|
| `--ansi-red` / `--ansi-bright-red` | `#e74c3c` | ANSI 终端标准色 |
| `--adl-file-badge-ink-pdf` | `#dc2626` | PDF 文件类型标识色 |
| `--chart-4` | `#dc2626` | 图表系列色 |
| `--editor-diff-remove-*` | `rgba(239/248,...)` | 代码差异可视化 |

### 6.2 Icons

**IconDownload（下载按钮）：**
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 12a9 9 0 1 0 -9 9" />
  <path d="M3.6 9h16.8" />
  <path d="M3.6 15h8.4" />
  <path d="M11.578 3a17 17 0 0 0 0 18" />
  <path d="M12.5 3c1.719 2.755 2.5 5.876 2.5 9" />
  <path d="M18 14v7m-3 -3l3 3l3 -3" />
</svg>
```

**IconDownloadSettings（下载设置）：**
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12.52 20.924c-.87 .262 -1.93 -.152 -2.195 -1.241a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.088 .264 1.502 1.323 1.242 2.192" />
  <path d="M19 16v6" />
  <path d="M22 19l-3 3l-3 -3" />
  <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
</svg>
```

**IconDelete（替换所有 IconTrash）：**
```svg
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14.7223 12.7585C14.7426 12.3448 14.4237 11.9929 14.01 11.9726C13.5963 11.9522 13.2444 12.2711 13.2241 12.6848L12.9999 17.2415C12.9796 17.6552 13.2985 18.0071 13.7122 18.0274C14.1259 18.0478 14.4778 17.7289 14.4981 17.3152L14.7223 12.7585Z" fill="currentColor"/>
  <path d="M9.98802 11.9726C9.5743 11.9929 9.25542 12.3448 9.27577 12.7585L9.49993 17.3152C9.52028 17.7289 9.87216 18.0478 10.2859 18.0274C10.6996 18.0071 11.0185 17.6552 10.9981 17.2415L10.774 12.6848C10.7536 12.2711 10.4017 11.9522 9.98802 11.9726Z" fill="currentColor"/>
  <path d="M10.249 2C9.00638 2 7.99902 3.00736 7.99902 4.25V5H5.5C4.25736 5 3.25 6.00736 3.25 7.25C3.25 8.28958 3.95503 9.16449 4.91303 9.42267L5.54076 19.8848C5.61205 21.0729 6.59642 22 7.78672 22H16.2113C17.4016 22 18.386 21.0729 18.4573 19.8848L19.085 9.42267C20.043 9.16449 20.748 8.28958 20.748 7.25C20.748 6.00736 19.7407 5 18.498 5H15.999V4.25C15.999 3.00736 14.9917 2 13.749 2H10.249ZM14.499 5H9.49902V4.25C9.49902 3.83579 9.83481 3.5 10.249 3.5H13.749C14.1632 3.5 14.499 3.83579 14.499 4.25V5ZM5.5 6.5H18.498C18.9123 6.5 19.248 6.83579 19.248 7.25C19.248 7.66421 18.9123 8 18.498 8H5.5C5.08579 8 4.75 7.66421 4.75 7.25C4.75 6.83579 5.08579 6.5 5.5 6.5ZM6.42037 9.5H17.5777L16.96 19.7949C16.9362 20.191 16.6081 20.5 16.2113 20.5H7.78672C7.38995 20.5 7.06183 20.191 7.03807 19.7949L6.42037 9.5Z" fill="currentColor"/>
</svg>
```

**IconTrash 替换范围（14 个文件）：**

| 文件 |
|------|
| `WorkspaceTerminalEntry.tsx` |
| `browserEntrySubEntriesUtils.tsx` |
| `TerminalPanel.tsx` |
| `TerminalNavigator.tsx` |
| `TerminalContextMenu.tsx` |
| `SearchEnginePopover.tsx` |
| `BrowserNavUtilityButtons.tsx` |
| `BrowserMenuDropdown.tsx` |
| `BrowserContextMenu.tsx` |
| `BrowserNavigator.tsx` |
| `useFileContextMenu.tsx` |
| `SidebarContextMenu.utils.tsx` |
| `useFileContextMenuItems.tsx` |
| `GitHubCITreeToolbar.tsx` |

---

## 7. i18n

### English (en-US/browser.ts)

```typescript
browserDownload: 'Downloads',
browserDownloadTooltip: 'Downloads ({n} in progress)',
downloadSearch: 'Search downloads...',
downloadInProgress: 'In Progress',
downloadCompleted: 'Completed',
downloadFailed: 'Failed',
downloadNoRecords: 'No downloads yet',
downloadAutoSave: 'Auto save',
downloadAskEachTime: 'Ask each time',
downloadModeAuto: 'Auto save to default path',
downloadModeAsk: 'Ask where to save each time',
downloadCancel: 'Cancel download',
downloadPause: 'Pause download',
downloadResume: 'Resume download',
downloadRetry: 'Retry',
downloadClearHistory: 'Clear all download history',
downloadClearHistoryConfirm: 'Clear all download history? This will not delete actual files.',
downloadOpenFolder: 'Open download folder',
downloadSettings: 'Download settings',
downloadShowInFolder: 'Show in folder',
downloadDeleteFile: 'Delete file',
downloadDeleteFileConfirm: 'Delete this file? This action cannot be undone.',
downloadRemoveRecord: 'Remove from download history',
downloadOpenFile: 'Open file',
downloadCopyLink: 'Copy download link',
downloadLinkCopied: 'Download link copied',
downloadErrorNoSpace: 'Not enough disk space',
downloadErrorAccessDenied: 'Access denied',
downloadErrorNetworkFailed: 'Network connection lost',
downloadErrorNetworkTimeout: 'Download timed out',
downloadErrorServerFailed: 'Server error',
downloadErrorServerUnauthorized: 'Authentication required',
downloadErrorInterrupted: 'Download interrupted',
downloadErrorFileNameConflict: 'File name conflict',
downloadErrorGeneric: 'Download failed',
downloadStarted: 'Download started: {fileName}',
downloadCompletedToast: 'Download completed: {fileName}',
downloadFailedToast: 'Download failed: {fileName}',
downloadCanceled: 'Download canceled',
browserDownloadSettingsTitle: 'Download Settings',
browserDownloadSettingsDesc: 'Configure default download location and behavior',
browserDownloadDefaultPath: 'Default save location',
browserDownloadMode: 'Download behavior',
browserDownloadBrowse: 'Browse...',
```

### Chinese (zh-CN/browser.ts)

```typescript
browserDownload: '下载',
browserDownloadTooltip: '下载（{n} 个进行中）',
downloadSearch: '搜索下载记录...',
downloadInProgress: '进行中',
downloadCompleted: '已完成',
downloadFailed: '失败',
downloadNoRecords: '暂无下载记录',
downloadAutoSave: '自动保存',
downloadAskEachTime: '每次询问',
downloadModeAuto: '自动保存到默认路径',
downloadModeAsk: '每次询问保存位置',
downloadCancel: '取消下载',
downloadPause: '暂停下载',
downloadResume: '恢复下载',
downloadRetry: '重试',
downloadClearHistory: '清空全部下载历史记录',
downloadClearHistoryConfirm: '清空全部下载历史记录？此操作不会删除真实文件。',
downloadOpenFolder: '打开默认下载文件夹',
downloadSettings: '下载设置',
downloadShowInFolder: '在文件夹中显示',
downloadDeleteFile: '删除真实文件',
downloadDeleteFileConfirm: '删除此文件？此操作无法撤销。',
downloadRemoveRecord: '从下载历史记录中移除',
downloadOpenFile: '打开文件',
downloadCopyLink: '复制下载链接',
downloadLinkCopied: '下载链接已复制',
downloadErrorNoSpace: '磁盘空间不足',
downloadErrorAccessDenied: '文件访问被拒绝',
downloadErrorNetworkFailed: '网络连接中断',
downloadErrorNetworkTimeout: '下载超时',
downloadErrorServerFailed: '服务器错误',
downloadErrorServerUnauthorized: '需要登录才能下载此文件',
downloadErrorInterrupted: '下载中断',
downloadErrorFileNameConflict: '文件名冲突',
downloadErrorGeneric: '下载失败',
downloadStarted: '开始下载：{fileName}',
downloadCompletedToast: '下载完成：{fileName}',
downloadFailedToast: '下载失败：{fileName}',
downloadCanceled: '下载已取消',
browserDownloadSettingsTitle: '下载设置',
browserDownloadSettingsDesc: '配置默认下载位置和下载行为',
browserDownloadDefaultPath: '默认保存路径',
browserDownloadMode: '下载行为',
browserDownloadBrowse: '浏览...',
```

### Interrupt Reason Mapping

```typescript
const INTERRUPT_REASON_MAP: Record<string, string> = {
  'FileNoSpace': 'downloadErrorNoSpace',
  'FileAccessDenied': 'downloadErrorAccessDenied',
  'NetworkFailed': 'downloadErrorNetworkFailed',
  'NetworkTimeout': 'downloadErrorNetworkTimeout',
  'ServerFailed': 'downloadErrorServerFailed',
  'ServerUnauthorized': 'downloadErrorServerUnauthorized',
  'Interrupted': 'downloadErrorInterrupted',
  'FileNameConflict': 'downloadErrorFileNameConflict',
  'UserCanceled': 'downloadCanceled',
};
```

---

## 8. Error Handling

### Error Flow

```
WebView2 DownloadStarting 事件
    ↓
检查磁盘空间 → 不足 → emit error(FileNoSpace) → 取消下载 → 显示 Toast
    ↓ 通过
检查文件名冲突 → 自动重命名 (1), (2), ...
    ↓
设置最终路径 → 允许下载开始
    ↓
订阅 BytesReceivedChanged → 推送进度到前端
    ↓
订阅 StateChanged →
├─ COMPLETED → 更新记录 → 显示完成 Toast
├─ INTERRUPTED → 映射 i18n → 更新记录 → 显示错误 Toast
└─ CANCELED → 更新记录 → 显示取消提示
```

### WebView2 Built-in Error Handling

| 错误 | WebView2 行为 | ADL 需要做的 |
|------|-------------|-------------|
| 文件名冲突 | 自动重命名为 `file (1).ext` | 无需额外处理 |
| 磁盘空间不足 | `StateChanged` → `InterruptReason = FileNoSpace` | 映射 i18n → Toast |
| 网络中断 | `StateChanged` → `InterruptReason = NetworkFailed` | 映射 i18n → 重试按钮 |
| 服务器 401/403 | `StateChanged` → 对应 InterruptReason | 映射 i18n |
| 用户取消 | `StateChanged` → `InterruptReason = UserCanceled` | 更新记录状态 |

### Edge Cases

| 场景 | 处理方式 |
|------|---------|
| 用户快速连续点击同一下载链接 | 检查 URL 是否已有 in_progress 记录，有则忽略 |
| 关闭浏览器面板 | 下载继续（后端管理） |
| 切换标签页 | 下载继续，进度环持续更新 |
| 文件被占用 | `InterruptReason = FileAccessDenied` → 映射错误 |
| URL 格式无效 | 后端校验，无效返回错误 |
| 下载记录超过 1000 条 | 按时间清理最早记录，保留最近 1000 条 |
| 设置路径不存在 | 自动创建目录，或回退 Downloads |

---

## 9. File Changes Summary

### New Files (Rust)

| File | Purpose |
|------|---------|
| `crates/browser/src/download_types.rs` | 数据模型 |
| `crates/browser/src/download_manager.rs` | 下载管理器核心 |
| `crates/browser/src/download_handler.rs` | WebView2 事件接线 |
| `src-tauri/src/commands/download_commands.rs` | Tauri 命令 |
| `src-tauri/migrations/YYYYMMDD_download_history.sql` | SQLite 迁移 |

### New Files (Frontend)

| File | Purpose |
|------|---------|
| `frontend/src/app/stores/slices/browserDownloadsSlice.ts` | Store 切片 |
| `frontend/src/app/features/browser/BrowserDownloadButton.tsx` | 工具栏下载按钮 |
| `frontend/src/app/features/browser/BrowserDownloadMenu.tsx` | 下载菜单卡片 |
| `frontend/src/app/features/browser/BrowserDownloadItem.tsx` | 单条下载记录 |
| `frontend/src/app/features/browser/BrowserDownloadContextMenu.tsx` | 右键菜单 |
| `frontend/src/app/features/browser/useBrowserDownloads.ts` | 事件监听 Hook |
| `frontend/src/app/features/browser-settings/BrowserDownloadSettings.tsx` | 设置页下载设置 |

### Modified Files

| File | Changes |
|------|---------|
| `src-tauri/src/main.rs` | 移除/修改 msWebOOUI 禁用；注册新命令 |
| `src-tauri/src/commands/browser_webview_setup.rs` | 添加 download_handler |
| `src-tauri/src/webview_event_bridge.rs` | 添加下载事件发射 |
| `crates/browser/src/lib.rs` | 导出新模块 |
| `ai-digital-life/frontend/src/app/features/browser/BrowserToolbar.tsx` | 添加下载按钮 |
| `ai-digital-life/frontend/src/app/features/browser-settings/SettingsNav.tsx` | 添加下载设置导航项 |
| `frontend/src/styles/themes.css` | 危险色标准化 |
| `frontend/src/design-system/icons.ts` | 添加新图标，替换 IconTrash |
| `frontend/src/i18n/en-US/browser.ts` | 添加下载 i18n 键值 |
| `frontend/src/i18n/zh-CN/browser.ts` | 添加下载 i18n 键值 |
| 14 个使用 IconTrash 的文件 | 替换图标导入 |
| 多个 CSS/TS 文件 | 硬编码红色回退值修复 |

### Removed/Replaced

| Item | Action |
|------|--------|
| `IconTrash` (旧) | 替换为 `IconDelete` |
| `#dc2626` / `#f87171` / `#ef4444` (danger色) | 替换为 `#e9967a` |
| 硬编码红色回退值 | 替换为 `#e9967a` 对应值 |
