# 修复计划："在文件管理器中打开"功能

## 问题分析

### 问题描述
右键菜单中的"在文件管理器中打开"功能点击后，文件资源管理器没有跳转到对应文件/文件夹位置。

### 根本原因
在以下两处代码中，构建路径时存在路径分隔符不统一的问题：

1. **文件树面板** (`FileNavigatorShell.tsx:202-209`)
2. **变更面板** (`ChangesPanel.tsx:477-483`)

都使用了 `${rootPath}/${targetNode.path}` 进行路径拼接，但：
- `rootPath` 可能是 Windows 格式（如 `E:\Projects\MyApp`）或 Unix 格式
- `targetNode.path` 使用正斜杠 `/` 作为分隔符
- 直接拼接会产生混合分隔符的路径，如 `E:\Projects\MyApp/filename.txt`

### 后端处理分析

#### Rust 后端 (`workspace.rs`)
```rust
let canonical = p.canonicalize().unwrap_or(p);
#[cfg(target_os = "windows")]
{
    let display_path = canonical.to_string_lossy().replace('/', "\\");
    std::process::Command::new("explorer")
        .arg(format!("/select,{display_path}"))
        .spawn()?;
}
```
- 期望接收绝对路径
- Windows 下使用 `canonicalize()` 规范化路径，将 `/` 替换为 `\`

#### 浏览器预览服务 (`previewWorkspaceService.ts`)
```typescript
async function revealInFileManager(targetPath: string): Promise<boolean> {
  const absolutePath = path.resolve(targetPath);
  if (!fsSync.existsSync(absolutePath)) {
    throw new Error(`path does not exist: ${targetPath}`);
  }
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(cmdPath, ["/c", "start", "", "explorer", `/select,"${absolutePath}"`], {
        windowsHide: false,
        detached: true,
      });
      // ...
    });
  }
}
```
- 使用 Node.js `path.resolve()` 处理路径
- Windows 下使用 `cmd /c start "" explorer /select,"path"`

## 修复方案

### 方案选择：直接拼接（优化）

由于 `rootPath` 已经是绝对路径，只需要正确拼接即可：
- 不需要使用 `path.join()`（避免引入额外的路径规范化逻辑）
- 直接拼接后，使用各端自己的路径规范化机制

### 需要修改的文件

| 文件 | 修改内容 |
|------|----------|
| `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx` | 修复文件树"在文件管理器中打开"的路径拼接 |
| `frontend/src/app/regions/right-panel/ChangesPanel.tsx` | 修复变更面板"在文件管理器中打开"的路径拼接 |

### 具体修改

#### 1. FileNavigatorShell.tsx (第 202-209 行)

**当前代码：**
```tsx
action: async (targetNode) => {
  const store = useAppStore.getState();
  const rootPath = store.appInfo?.currentWorkspace?.rootPath ?? store.appInfo?.currentWorkspace?.path;
  if (!rootPath) return;
  await window.digitalLife.workspace.revealInFileManager(
    `${rootPath}/${targetNode.path}`
  );
}
```

**修改为：**
```tsx
action: async (targetNode) => {
  const store = useAppStore.getState();
  const rootPath = store.appInfo?.currentWorkspace?.rootPath ?? store.appInfo?.currentWorkspace?.path;
  if (!rootPath) return;
  const separator = rootPath.includes("\\") ? "\\" : "/";
  const fullPath = `${rootPath}${rootPath.endsWith(separator) ? "" : separator}${targetNode.path}`;
  await window.digitalLife.workspace.revealInFileManager(fullPath);
}
```

#### 2. ChangesPanel.tsx (第 477-483 行)

**当前代码：**
```tsx
action: async (targetNode) => {
  const store = useAppStore.getState();
  const appInfo = store.appInfo;
  const rootPath = appInfo?.currentWorkspace?.rootPath ?? appInfo?.currentWorkspace?.path;
  if (!rootPath) return;
  await window.digitalLife.workspace.revealInFileManager(`${rootPath}/${targetNode.path}`);
}
```

**修改为：**
```tsx
action: async (targetNode) => {
  const store = useAppStore.getState();
  const appInfo = store.appInfo;
  const rootPath = appInfo?.currentWorkspace?.rootPath ?? appInfo?.currentWorkspace?.path;
  if (!rootPath) return;
  const separator = rootPath.includes("\\") ? "\\" : "/";
  const fullPath = `${rootPath}${rootPath.endsWith(separator) ? "" : separator}${targetNode.path}`;
  await window.digitalLife.workspace.revealInFileManager(fullPath);
}
```

## 其他考虑

### 1. 路径格式一致性
现有代码中"复制完整路径"功能也使用了类似的拼接方式（第 486-496 行和第 213-222 行），也需要同步修复以保持一致性。

### 2. 后端容错能力
Rust 后端已经有容错机制（`canonicalize().unwrap_or(p)` + 手动替换 `/` 为 `\`），但更优的做法是前端就传递正确格式的路径。

### 3. 浏览器模式
浏览器模式下使用 Node.js `path.resolve()`，它能够处理混合分隔符的路径。但为了代码一致性和健壮性，前端应传递正确格式的路径。

## 实现步骤

1. 修改 `FileNavigatorShell.tsx` 中的路径拼接逻辑
2. 修改 `ChangesPanel.tsx` 中的路径拼接逻辑
3. 同步检查并修复"复制完整路径"功能中的类似问题
4. 运行测试验证 Tauri 桌面应用和浏览器模式下的功能

## 验证清单

- [ ] Tauri 桌面应用：文件树右键"在文件管理器中打开"
- [ ] Tauri 桌面应用：变更面板右键"在文件管理器中打开"
- [ ] 浏览器模式：文件树右键"在文件管理器中打开"
- [ ] 浏览器模式：变更面板右键"在文件管理器中打开"
- [ ] 路径包含中文字符的情况
- [ ] 路径包含空格的情况
- [ ] 深层嵌套目录的情况
