# Windows `\\?\` 扩展长度路径前缀处理经验

## 背景

Rust 的 `std::fs::canonicalize()` 在 Windows 上返回带 `\\?\` 前缀的扩展长度路径（如 `\\?\C:\Users\...`）。该前缀是 Windows API 用于绕过 MAX_PATH (260 字符) 限制的机制，但不应暴露给用户。

## 影响范围

所有通过 `WorkspaceMeta.root_path` 暴露给前端的文件系统路径均受影响，包括：
- 左侧边栏工作区路径 tooltip
- 右侧面板文件树/变更树/终端树的工作区路径 tooltip
- 通过 `workspace_get_absolute_path` 命令返回的路径

## 修复方案

### 核心函数

`crates/workspace/src/detect.rs` 中新增 `strip_verbatim_prefix()`：

```rust
pub fn strip_verbatim_prefix(s: &str) -> String {
    if cfg!(windows) {
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            if let Some(unc) = stripped.strip_prefix("UNC\\") {
                return format!("\\{}", unc);
            }
            return stripped.to_string();
        }
    }
    s.to_string()
}
```

### 覆盖范围

| 位置 | 层级 | 说明 |
|------|------|------|
| `detect.rs:open_workspace()` | 源头 | 新开工作区路径存储前清理 |
| `lib.rs:get_absolute_path()` | 源头 | 绝对路径解析返回前清理 |
| `setup.rs:current_workspace` | 加载 | 启动时从 DB 加载后清理存量数据 |
| `workspace_sidebar.rs:entry_from_workspace()` | 加载 | 侧边栏从 DB 加载时清理 |
| `workspace_sidebar.rs:merge_workspace_meta_into_sidebar()` | 加载 | 侧边栏路径合并时清理 |
| `app.rs:build_app_info()` | 输出 | 返回前端前兜底清理 |

### 技术要点

1. **`\\?\` 前缀特性**：Windows 底层 API 产物，`Path::exists()` 等文件操作兼容两种格式
2. **UNC 路径**：`\\?\UNC\server\share` → `\\server\share`，同样需要处理
3. **前斜杠版本**：经过 `.replace('\\', '/')` 后 `\\?\` 变为 `//?/`，在 `get_absolute_path` 中单独处理
4. **`cfg!(windows)`**：编译期条件保证非 Windows 平台无开销

### 相关文件

- `crates/workspace/src/detect.rs` — 核心函数定义
- `crates/workspace/src/lib.rs` — `get_absolute_path` 中的处理
- `src-tauri/src/setup.rs` — 启动时加载清理
- `src-tauri/src/commands/workspace_sidebar.rs` — 侧边栏加载清理
- `src-tauri/src/commands/app.rs` — 返回前端前兜底清理
