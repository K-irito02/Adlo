# 工作区选择/路径绑定 重构方案

## 1. 摘要

重构文件选择、路径绑定与 Ctrl+N/O 快捷键体系，使用 **C# helper 运行时编译 + PromptModal 双重保障** 策略，确保所有运行模式（Tauri 桌面 / 外部浏览器 / Trae 内置浏览器）下都能可靠地选择或创建工作区目录。同时移除未使用的「绑定」概念，语义清晰地区分 Ctrl+N（创建工作区）和 Ctrl+O（打开已有工作区）。

## 2. 当前状态分析

### 架构概览

```
用户交互入口 (4个)
├── WelcomeState "打开工作空间" 按钮 → handleTriggerCreateWorkspace
├── StatusBar "Pick Directory" / "Bind" / 最近工作区
├── TitleBar "Ctrl+N" / "Ctrl+O" / LeftSidebar "+" 按钮
└── 全局 Ctrl+O 快捷键
     ↓
App.tsx (中枢接线)
     ↓
store.ts (openWorkspace / pickWorkspaceDirectory)
     ↓
DigitalLifeBridge (三方桥接)
├── tauri-bridge → Rust Tauri Command (原生桌面)
├── preview-bridge → Vite Preview API (Node.js)
└── mock-bridge → 纯内存 (开发模拟)
```

### 已知问题

| # | 问题 | 根因 |
|---|------|------|
| 1 | 浏览器模式 `pickDirectory` 无法弹出对话框 | Node.js 后台进程无可见窗口 |
| 2 | `window.prompt()` 在 Trae 内置浏览器崩溃 | 沙箱 iframe 禁止 prompt |
| 3 | Ctrl+N / Ctrl+O 执行完全相同的逻辑 | 未区分「创建」和「打开」 |
| 4 | 路径「绑定」概念未真正使用 | pending + bind 两个按钮都立即 `openWorkspace` |
| 5 | 浏览器模式无目录浏览能力 | 只能手动输入路径 |

## 3. 涉及文件清单

### 新建文件 (2个)

| 文件 | 说明 |
|------|------|
| `frontend/dev/picker/FolderPicker.cs` | C# 源码，运行时用 `csc.exe` 编译，弹出原生 `FolderBrowserDialog` |
| `frontend/src/app/components/PromptModal.tsx` | React 模态框组件，带文本输入 + 路径校验 + 确认/取消按钮 |

### 修改文件 (8个)

| 文件 | 修改内容 |
|------|---------|
| `frontend/dev/previewWorkspaceService.ts` | 替换 `pickDirectory` 为 C# 编译 + 运行；`openWorkspace` 支持自动创建目录；新增 `/workspace/app-directory` 和 `/workspace/create-directory` 端点 |
| `frontend/src/app/App.tsx` | 重写 Ctrl+N/O 快捷键；去掉 binding 相关回调/wiring；接入 PromptModal |
| `frontend/src/app/store.ts` | 移除 `pendingWorkspacePath`/`setPendingWorkspacePath`；添加 `defaultWorkspaceDir` 偏好；简化 `openWorkspace` |
| `frontend/src/app/regions/StatusBar.tsx` | 移除「Bind」按钮和 `handleBindPendingWorkspace`；简化菜单交互 |
| `frontend/src/app/regions/CenterPane.tsx` | 移除 binding 相关 props 和 callback |
| `frontend/src/app/regions/TitleBar.tsx` | File 菜单中 Ctrl+N → PromptModal（创建），Ctrl+O → 原生对话框（打开） |
| `frontend/src/styles/regions.css` | 添加 PromptModal 的样式定义 |
| `frontend/src/app/components/WelcomeState.tsx` | 按钮文本和回调调整 |

### 不修改的文件

| 文件 | 原因 |
|------|------|
| `frontend/src/tauri-bridge.ts` | Tauri 模式正常工作，无需改动 |
| `frontend/src/mock-bridge.ts` | 纯内存模拟，无需改动 |
| `frontend/src/shared/ipc.ts` | 接口契约已满足需求，无需追加新方法 |
| `src-tauri/` | Tauri Rust 后端正常工作，无需改动 |

## 4. 详细设计方案

### 4.1 C# FolderPicker (Windows 原生对话框)

**文件**: `frontend/dev/picker/FolderPicker.cs`

```csharp
using System;
using System.Windows.Forms;

class FolderPicker {
    [STAThread]
    static void Main() {
        using (var dialog = new FolderBrowserDialog()) {
            dialog.Description = "Select workspace folder";
            dialog.ShowNewFolderButton = true;
            if (dialog.ShowDialog() == DialogResult.OK) {
                Console.Write(dialog.SelectedPath);
            }
        }
    }
}
```

**编译方式**: 运行时用系统内置 `csc.exe` 编译：
- `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`
- `C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe`

**关键优势**:
- `[STAThread]` 确保 Single-Threaded Apartment，这是 WinForms 对话框的必要条件
- 编译为独立 EXE，可在新进程中运行（`detached: true`），不依赖父进程窗口
- csc.exe 在所有 Windows 10+ 上内置可用（.NET Framework 4.x）

**交叉平台**:
- Windows: 用 C# helper (或回退到 `powershell -Sta`)
- macOS: 保持现有的 `osascript choose folder`
- Linux: 保持现有的 `zenity` / `kdialog`

### 4.2 PromptModal 组件

**文件**: `frontend/src/app/components/PromptModal.tsx`

Props:
```typescript
interface PromptModalProps {
  open: boolean;
  title: string;              // 对话框标题
  placeholder: string;        // 输入框占位文本
  initialValue?: string;      // 初始值（如默认工作区目录）
  okLabel: string;            // 确认按钮文本（如"打开"或"创建"）
  onOk: (value: string) => void | Promise<void>;
  onCancel: () => void;
}
```

行为：
1. 打开时聚焦到输入框
2. 用户输入完整路径 → 直接使用
3. 用户输入纯名称 → 拼接 `<defaultWorkspaceDir>/<name>`
4. 按 Enter 确认，Esc 取消
5. 有 loading 状态（确认后异步操作期间）

### 4.3 快捷键行为重定义

| 快捷键 | 新行为 | 详细流程 |
|--------|--------|---------|
| **Ctrl+O** | 打开已有工作区 | `pickDirectory()` → 尝试原生对话框 → 失败则弹 PromptModal（标题："打开工作空间"）→ `openWorkspace(path)` |
| **Ctrl+N** | 新建工作区 | 直接弹 PromptModal（标题："创建工作空间"）→ 输入路径/名称 → 路径不存在则递归创建 → `openWorkspace(path)` |

### 4.4 去掉「绑定」概念

**移除**:
- `store.ts`: `pendingWorkspacePath` 状态字段、`setPendingWorkspacePath` action
- `StatusBar.tsx`: `handleBindPendingWorkspace` 函数、「Bind」按钮和相关 UI
- `CenterPane.tsx` / `App.tsx`: `onSetPendingWorkspacePath`、`pendingWorkspacePath` 相关 props

**简化后**:
- StatusBar 工作区菜单：输入框 + 「Open」按钮（直接打开）
- 「Pick Directory」按钮：弹出原生对话框后，直接打开选中目录
- 最近工作区列表：点击直接打开

### 4.5 默认工作区目录

- 存储在 `AppInfo.config` 扩展字段 `defaultWorkspaceDir`
- 用户可通过 Settings 面板修改
- 默认值（用户未设置时）：
  - 浏览器模式: `path.dirname(process.cwd())` 即 `notes/` 目录
  - Tauri 模式: `app.path().appDataDir()` 或 `app.path().homeDir() + '/AIWorkspaces'`
- 在 previewWorkspaceService.ts 中新增 `/workspace/app-directory` 端点返回应用根目录

### 4.6 pickDirectory 实现策略（按优先级）

```
┌─ isTauriShell()? ─→ Tauri Rust 原生 dialog
│
├─ platform === "win32"?
│   ├─ 尝试 C# helper (csc.exe + FolderPicker.exe)
│   ├─ 失败 → 尝试 PowerShell -Sta (windowStyle Normal)
│   └─ 失败 → 返回 undefined (触发 PromptModal fallback)
│
├─ platform === "darwin"?
│   └─ osascript choose folder (保持不变)
│
└─ platform === "linux"?
    └─ zenity / kdialog (保持不变)
```

### 4.7 新建工作区(Ctrl+N)时的目录创建

当用户输入的路径在本地不存在时：
1. previewWorkspaceService.ts 中的 `openWorkspace()` 先检查路径
2. 如果不存在，递归创建目录 (`fs.mkdir(path, { recursive: true })`)
3. 然后正常打开

Tauri 模式同理：Rust 端 `workspace_open` 先检查，不存在则 `std::fs::create_dir_all`。

### 4.8 CSS 样式

在 `regions.css` 中新增 PromptModal 样式，遵循设计系统：
- 使用现有 CSS 变量 (`--bg-overlay`, `--bg-strong`, `--text-primary`, `--border-default` 等)
- 半透明遮罩层
- 居中模态框面板
- 输入框和操作按钮

```
.adl-prompt-modal          ─ 半透明遮罩
.adl-prompt-modal__panel   ─ 居中面板
.adl-prompt-modal__input   ─ 文本输入框
.adl-prompt-modal__actions ─ 按钮组（取消/确认）
```

## 5. 实现步骤

### Step 1: 创建 C# FolderPicker 源码
- 文件: `frontend/dev/picker/FolderPicker.cs`
- 极简的 `FolderBrowserDialog` 封装
- `[STAThread]` 确保对话框正常显示

### Step 2: 实现 C# 编译 + 运行模块
- 在 `previewWorkspaceService.ts` 中添加:
  - `compileFolderPicker()`: 扫描 csc.exe 路径并编译
  - `runFolderPicker()`: 以 detached 模式运行编译后的 exe
  - `pickDirectory()` 中集成该逻辑（Windows 优先路径）

### Step 3: 实现 PromptModal React 组件
- 文件: `frontend/src/app/components/PromptModal.tsx`
- 带 Props: open, title, placeholder, initialValue, okLabel, onOk, onCancel
- Enter 确认 / Esc 取消
- 纯名称 → 自动拼接 defaultWorkspaceDir

### Step 4: 添加 PromptModal 样式
- 在 `regions.css` 中添加 `.adl-prompt-modal*` 样式
- 遵循设计系统 CSS 变量
- 支持深色/浅色主题

### Step 5: 重构 StatusBar.tsx
- 移除 `handleBindPendingWorkspace`
- 移除「Bind」按钮
- 「Pick Directory」直接 `onPickWorkspaceDirectory → openWorkspace`
- 输入框保留 + 「Open」按钮

### Step 6: 重构 App.tsx
- Ctrl+N: 弹 PromptModal → 创建 + 打开
- Ctrl+O: 尝试 pickDirectory → fallback PromptModal
- 移除 `pendingWorkspacePath` / `setPendingWorkspacePath` 相关 props wiring

### Step 7: 重构 store.ts
- 移除 `pendingWorkspacePath` + `setPendingWorkspacePath`
- 添加 `defaultWorkspaceDir` 偏好（通过 app preferences 持久化）
- 简化 `openWorkspace`（无需再处理 pending path）

### Step 8: 清理 CenterPane.tsx / TitleBar.tsx / WelcomeState.tsx
- CenterPane: 移除 binding props
- TitleBar: Ctrl+N → new workspace, Ctrl+O → open folder
- WelcomeState: 保持 `onTriggerCreateWorkspace` 但行为改 Ctrl+N

### Step 9: 更新 previewWorkspaceService.ts
- 新增 `createWorkspaceDirectory(rootPath)` 工具函数
- 修改 `openWorkspace()` 在目录不存在时自动创建
- 新增 `/workspace/app-directory` 端点
- 新增 `/workspace/create-directory` 端点（可选，也可由 openWorkspace 内部处理）

### Step 10: 验证
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend test`
- 浏览器预览模式手工验证所有入口

## 6. 假设与决策记录

| 决策 | 说明 |
|------|------|
| C# helper 运行时编译，不提交二进制 | `csc.exe` 所有 Windows 10+ 内置 |
| 默认工作区目录可配置 | 存入 app preferences |
| PromptModal 是通用 fallback | 覆盖所有原生对话框失败的场景 |
| Tauri 后端不改动 | Rust 端 `workspace_open` 和 `workspace_pick_directory` 正常工作 |
| macOS/Linux 保持原有方案 | 不使用 C# helper（平台无关） |
| 去掉 binding 概念 | pendingWorkspacePath 实际并未使用 |

## 7. 验证清单

- [ ] 编译检查通过 (`npm run typecheck`)
- [ ] 单元测试通过 (`npm test`)，已有失败 7 项不变
- [ ] Tauri 桌面环境下 pickDirectory 弹出原生对话框
- [ ] 浏览器模式下 pickDirectory 尝试 C# helper（Windows）
- [ ] Trae 内置浏览器中 PromptModal 正常显示
- [ ] Ctrl+N 弹出 PromptModal，输入名称/路径后自动创建并打开
- [ ] Ctrl+O 弹出原生对话框，失败后 fallback 到 PromptModal
- [ ] StatusBar 「Open」按钮直接打开路径
- [ ] WelcomeState 按钮正常工作
- [ ] 默认工作区目录可配置
- [ ] 深色/浅色主题下 PromptModal 样式正确
