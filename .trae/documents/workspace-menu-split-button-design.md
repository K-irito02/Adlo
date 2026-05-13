# 工作区菜单复合按钮设计文档

## 概述

重构状态栏工作区菜单中的"打开路径"区域，将其替换为可切换模式的复合分割按钮（SplitButton），包含三种操作模式：选择文件夹、打开文件夹、创建文件夹。

## 变更列表

### 1. 文案更改

| 位置 | 现状 | 改为 | 对应 copy.ts key |
|------|------|------|-----------------|
| 区域副标题 | `workspaceOpenTitle`（打开路径） | "打开工作空间" | 修改 `workspaceOpenTitle` 值 |
| 原"打开路径"按钮 | `workspaceOpenTitle`（打开路径） | "打开文件夹" | 新增 key `workspaceOpenFolder`（"打开文件夹"） |
| 下拉新增项 | — | "创建文件夹" | 新增 key `workspaceCreateFolder`（"创建文件夹"） |

### 2. 复合按钮（SplitButton）

#### 数据类型

```typescript
type WorkspaceActionMode = "pick" | "open" | "create";
```

#### 组件结构

```
┌────────────────────────────────┬──────┐
│ 📂 选择文件夹                  │  ▼  │
└────────────────────────────────┴──────┘
  ├── 选择文件夹（pick）       ← 默认模式
  ├── 打开文件夹（open）
  └── 创建文件夹（create）
```

- **左侧主按钮**：图标 + 当前模式名称，点击触发该模式的主要操作
- **右侧 ▼ 按钮**：点击弹出下拉菜单，列出三种模式

#### 状态管理

```typescript
// React state
const [actionMode, setActionMode] = useState<WorkspaceActionMode>("pick");

// localStorage 持久化（组件 mount 时读取）
const STORAGE_KEY_MODE = "adl_workspace_menu_mode";
const STORAGE_KEY_DEFAULT_DIR = "adl_workspace_default_create_dir";
```

### 3. 三种模式行为定义

#### 模式 pick：选择文件夹

| 属性 | 值 |
|------|-----|
| 按钮文字 | "选择文件夹" |
| 按钮图标 | 📂（IconFolderOpen） |
| 主按钮行为 | 直接调用 `pickWorkspaceDirectory()` → 成功后 `openWorkspace(path)` |
| 下方输入框 | **隐藏** |

**交互流程：**
```
用户点击"选择文件夹" → 原生目录选择器弹出
  ├── 用户取消 → 无操作
  └── 用户选择路径 → 立即调用 openWorkspace(path)
```

#### 模式 open：打开文件夹

| 属性 | 值 |
|------|-----|
| 按钮文字 | "打开文件夹" |
| 按钮图标 | 📂（IconFolderOpen） |
| 主按钮行为 | 读取输入框值 → 路径存在性验证 → `openWorkspace(path)` |
| 下方输入框 | **显示**，占位符："输入工作空间路径（路径必须存在）" |
| 输入框右侧 | 无 ⋮ 按钮 |

**交互流程：**
```
用户输入路径 → 点击"打开文件夹"按钮
  ├── 路径不存在 → 下方显示红色错误提示 "路径不存在，请检查后重试"
  └── 路径存在 → 调用 openWorkspace(path)
```

**错误处理：**
- 输入的路径不存在时，不清空输入框，而是显示错误消息
- 错误消息位置：输入框下方，红色文字
- 用户修改输入内容后，错误消息自动清除

#### 模式 create：创建文件夹

| 属性 | 值 |
|------|-----|
| 按钮文字 | "创建文件夹" |
| 按钮图标 | 📁（IconFolder） |
| 主按钮行为 | 读取输入框值 → `openWorkspace(path)`（自动创建目录） |
| 下方输入框 | **显示**，占位符："输入路径或名称（如 my-project）" |
| 输入框右侧 | **⋮ 按钮**（竖三点） |

**交互流程：**
```
用户输入路径/名称 → 点击"创建文件夹"按钮
  └── 调用 openWorkspace(path)
      ├── 路径不存在 → 自动递归创建目录
      └── 路径已存在 → 直接打开，不清空原有内容
```

**名称自动解析逻辑：**
- 输入内容不含 `\` 或 `/`（即为简单名称）：
  - 使用默认创建工作空间目录作为父目录
  - 拼接为 `{defaultDir}/{name}`
  - 示例：输入 `my-project` → 打开 `C:\Users\用户名\projects\my-project`
- 输入内容含路径分隔符（即为完整路径）：
  - 直接使用输入的路径
  - 示例：输入 `D:\workspace\new-app` → 自动创建目录并打开

### 4. ⋮（竖三点）设置面板

仅在 **create 模式**下显示。点击 ⋮ 按钮弹出设置面板。

#### 面板内容

```
┌─ 创建文件夹设置 ──────────────────────┐
│                                        │
│  默认创建工作空间目录                    │
│  [C:\Users\用户名\projects       ] [📂] │
│                                        │
│  ────────────────────────────────────  │
│  📝 输入工作空间名称时：                 │
│  将在默认目录下创建同名文件夹并打开。      │
│  例：my-project → {defaultDir}/my-project│
│                                        │
│  📂 输入完整路径时：                     │
│  自动递归创建目录并打开。                 │
│  例：D:\ws\app → 创建 D:\ws\app 并打开  │
│                                        │
│  ⚡ 路径已存在时：                       │
│  直接打开，不清空不覆盖。                │
│                                        │
│  [             💾 保存设置          ]    │
└────────────────────────────────────────┘
```

#### 关闭行为
- 点击面板外的区域或按 Escape → 面板关闭
- 点击"保存设置"按钮 → 持久化默认目录到 localStorage + 面板关闭

### 5. 持久化

```typescript
const STORAGE_KEYS = {
  MODE: "adl_workspace_menu_mode",          // WorkspaceActionMode
  DEFAULT_CREATE_DIR: "adl_workspace_default_create_dir", // string
};
```

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `adl_workspace_menu_mode` | `WorkspaceActionMode` | `"pick"` | 上次用户选择的模式 |
| `adl_workspace_default_create_dir` | `string` | `""`（空=使用应用所在目录的父目录） | 用户设置的默认创建工作空间目录 |

- 组件 mount 时从 localStorage 读取上次模式
- 每次用户切换模式时立即写入 localStorage
- 默认目录更改并保存后写入 localStorage
- `previewWorkspaceService.ts` 中新增接口 `/workspace/app-directory` 返回 `process.cwd()`，用于计算默认目录

### 6. 影响到的文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `copy.ts` | 修改 + 新增 | 修改 `workspaceOpenTitle`（打开路径→打开工作空间）；新增 `workspaceOpenFolder`（打开文件夹）、`workspaceCreateFolder`（创建文件夹） |
| `StatusBar.tsx` | 重构 | 替换当前"打开路径"区域的输入框+两个按钮为复合 SplitButton + 条件输入框 + ⋮ 设置面板；新增本地 `error` 状态用于显示路径验证错误；`onOpenWorkspace` prop 类型改为 `(path: string) => Promise<{ ok: boolean; error?: string }>` |
| `regions.css` | 新增样式 | SplitButton 相关样式（`.adl-split-btn`、`.adl-split-btn__main`、`.adl-split-btn__drop`、条件输入框错误提示样式、过渡动画等） |
| `previewWorkspaceService.ts` | 确认 | 检查 `/workspace/app-directory` 端点是否存在，不存在则新增 |
| `store.ts` | 确认 | `openWorkspace` 返回类型确认已改为 `Promise<{ ok: boolean; error?: string }>` |

### 7. 不在此次范围内的变更

- 欢迎页的"打开工作空间"按钮保持不变
- Ctrl+N / Ctrl+O 快捷键行为不变（已在上次重构中完成）
- TitleBar 文件菜单的行为不变

### 8. 验证清单

- [ ] 复合按钮的三种模式切换正常
- [ ] 模式被持久化到 localStorage（刷新后恢复上次选择）
- [ ] "选择文件夹"模式点击主按钮直接弹出原生目录选择器
- [ ] "打开文件夹"模式输入有效路径能正常打开
- [ ] "打开文件夹"模式输入无效路径显示错误提示
- [ ] "创建文件夹"模式输入名称时使用默认目录拼接
- [ ] "创建文件夹"模式输入完整路径时直接使用
- [ ] "创建文件夹"模式的 ⋮ 设置面板显示/关闭正常
- [ ] 默认目录设置可保存到 localStorage
- [ ] typecheck 通过（无新增错误）
- [ ] 测试通过（无新增失败）
