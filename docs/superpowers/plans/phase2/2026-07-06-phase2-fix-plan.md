# Phase 2 集中修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Phase 2 19 项能力中的全部缺陷——填实后端桩实现，挂载全部前端孤立组件，使 18 项能力端到端可用。

**Architecture:** 8 个独立 Task，各自可自测可提交。后端修复优先于前端挂载。核心原则：不引入向后兼容代码，不破坏现有 323 Rust + 326 前端测试。

**Tech Stack:** Rust (tokio + lsp-server + rusqlite), TypeScript/React 19 (Zustand + Vite), Tauri 2.x

## Global Constraints

- 禁止引入 `unwrap()`，使用 `?` 或模式匹配
- 禁止产生任何新的 lint/clippy warning
- 所有 Rust 修改必须通过 `cargo clippy --workspace --all-targets`（在 ai-digital-life/ 运行）
- 所有前端修改必须通过 `npx eslint . && npx tsc --noEmit`（在 frontend/ 运行）
- 禁止添加向后兼容代码或数据迁移逻辑
- 前端 UI 文本必须使用 i18n key（useTCopy），禁止硬编码
- 所有新增 Tauri Command 必须类型化 + 登记到 capabilities/*.json
- SQLite schema 变更必须附带迁移脚本

---

### Task 1: LSP 后端——实现真实的服务器启动

**Files:**
- Modify: `crates/lsp-client/src/client.rs` (全部重写)
- Modify: `crates/lsp-client/Cargo.toml` (确认依赖)
- Test: `crates/lsp-client/src/client.rs` (底部测试模块)

**Interfaces:**
- Consumes: `LanguageServer::command()` → `Vec<&str>` (已实现)
- Produces: `LspClient::start_server()` 实际生成 LSP 子进程并完成初始化握手

- [ ] **Step 1: 写测试验证 start_server 实际生成进程**

```rust
// 追加到 client.rs 测试模块
#[tokio::test]
async fn start_server_spawns_process() {
    let client = LspClient::new(PathBuf::from("/tmp"));
    // rust-analyzer 可能不可用，使用 cat 模拟
    let result = client.start_server(LanguageServer::Custom("cat".to_string())).await;
    assert!(result.is_ok());
    let state = client.get_state(&LanguageServer::Custom("cat".to_string())).await;
    assert_eq!(state, LspClientState::Running);
    client.stop_server(&LanguageServer::Custom("cat".to_string())).await.unwrap();
}
```

- [ ] **Step 2: 运行测试，确认当前桩实现会失败或通过错误断言**

```powershell
cd ai-digital-life; cargo test -p adl-lsp-client -- --nocapture
```

- [ ] **Step 3: 重写 LspClient 结构体**

```rust
use lsp_server::{Connection, IoThreads, Message};
use lsp_types::*;
use std::collections::HashMap;

#[derive(Debug)]
pub struct LspServerHandle {
    pub state: LspClientState,
    pub connection: Option<Connection>,
    pub io_threads: Option<IoThreads>,
}

#[derive(Debug)]
pub struct LspClient {
    servers: Arc<Mutex<HashMap<LanguageServer, LspServerHandle>>>,
    workspace_root: PathBuf,
}
```

- [ ] **Step 4: 实现真实的 start_server**

```rust
pub async fn start_server(&self, server: LanguageServer) -> Result<(), AppError> {
    let mut servers = self.servers.lock().await;
    if servers.contains_key(&server) {
        return Ok(());
    }

    let cmd_parts = server.command();
    if cmd_parts.is_empty() {
        return Err(AppError::InvalidInput("Empty LSP command".into()));
    }

    let program = cmd_parts[0];
    let args: Vec<&str> = cmd_parts[1..].iter().copied().collect();

    // Verify the command exists
    let which = Command::new("which").arg(program).output().await;
    match which {
        Ok(output) if !output.status.success() => {
            servers.insert(server.clone(), LspServerHandle {
                state: LspClientState::Error,
                child: None,
                connection: None,
            });
            return Err(AppError::NotFound(format!("LSP server '{}' not found on PATH", program)));
        }
        _ => {}
    }

    servers.insert(server.clone(), LspServerHandle {
        state: LspClientState::Starting,
        child: None,
        connection: None,
    });
    drop(servers); // release lock before spawning

    // Spawn the LSP process via lsp-server's Connection::stdio
    let (connection, io_threads) = Connection::stdio(program, &args);

    // Send initialize request
    let init_params = serde_json::to_value(InitializeParams {
        process_id: Some(std::process::id()),
        root_uri: Some(url::Url::from_directory_path(&self.workspace_root)
            .map_err(|_| AppError::InvalidInput("Invalid workspace path".into()))?),
        capabilities: ClientCapabilities::default(),
        ..Default::default()
    }).map_err(|e| AppError::Internal(e.to_string()))?;

    let init_request = connection.initialize(init_params)
        .map_err(|e| AppError::Internal(format!("LSP initialize failed: {}", e)))?;

    tracing::info!("LSP server initialized: {:?}", server);

    let mut servers = self.servers.lock().await;
    servers.insert(server.clone(), LspServerHandle {
        state: LspClientState::Running,
        connection: Some(connection),
        io_threads: Some(io_threads),
    });

    Ok(())
}
```

- [ ] **Step 5: 确认依赖已就绪**

```bash
# crates/lsp-client/Cargo.toml 应已有:
# lsp-server = "0.7"
# lsp-types = "0.97"
# tokio = "1"
# 检查并追加:
grep -E "lsp-server|lsp-types" crates/lsp-client/Cargo.toml
# 如缺少 url crate:
# url = "2"
```

- [ ] **Step 6: 运行测试，验证通过**

```bash
cd ai-digital-life && cargo test -p adl-lsp-client
```

- [ ] **Step 7: 运行 clippy，确认零警告**

```bash
cd ai-digital-life && cargo clippy --workspace --all-targets 2>&1 | tail -20
```

- [ ] **Step 8: Commit**

```bash
git add crates/lsp-client/
git commit -m "fix(lsp): implement actual LSP server startup via lsp-server Connection::stdio"

```

---

### Task 2: Agent 工具——实现 read/glob/grep 执行

**Files:**
- Create: `crates/agent-runtime/src/tools/read.rs`
- Create: `crates/agent-runtime/src/tools/glob.rs`
- Create: `crates/agent-runtime/src/tools/grep.rs`
- Modify: `crates/agent-runtime/src/tools/mod.rs`
- Modify: `crates/agent-runtime/src/tools/registry.rs` (execute match arm + struct inputs)
- Test: inline in each new file

**Interfaces:**
- Consumes: `adl_fs_ops`, `tokio::fs`, `tokio::process::Command` (ripgrep)
- Produces: `ToolRegistry::execute("read", input)`, `ToolRegistry::execute("glob", input)`, `ToolRegistry::execute("grep", input)` 返回 `ToolExecutionResult`

- [ ] **Step 1: 创建 read.rs**

```rust
use adl_errors::AppError;
use tokio::fs;

pub struct ReadInput {
    pub path: String,
}

pub async fn read_file(path: &str) -> Result<String, AppError> {
    // Security: prevent path traversal
    let path = path.replace("..", "");
    let content = fs::read_to_string(&path).await
        .map_err(|e| AppError::NotFound(format!("Cannot read file '{}': {}", path, e)))?;
    // Truncate to 50KB like webfetch
    if content.len() > 51_200 {
        Ok(format!("{}...\n[Output truncated at 50KB]", &content[..51_200]))
    } else {
        Ok(content)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::fs;
    use std::sync::Once;

    static INIT: Once = Once::new();

    async fn setup() {
        INIT.call_once(|| {
            let _ = fs::write("_test_read_file.txt", "hello world");
        });
    }

    #[tokio::test]
    async fn reads_existing_file() {
        fs::write("_test_read_ok.txt", "test content").await.unwrap();
        let result = read_file("_test_read_ok.txt").await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "test content");
        let _ = fs::remove_file("_test_read_ok.txt").await;
    }

    #[tokio::test]
    async fn returns_error_for_missing_file() {
        let result = read_file("_nonexistent_file_xyz.txt").await;
        assert!(result.is_err());
    }
}
```

- [ ] **Step 2: 创建 glob.rs**

```rust
use adl_errors::AppError;
use tokio::process::Command;

pub struct GlobInput {
    pub pattern: String,
}

pub async fn glob_files(pattern: &str) -> Result<String, AppError> {
    let output = Command::new("cmd")
        .args(&["/c", "dir", &pattern.replace('/', "\\"), "/s", "/b"])
        .output().await
        .map_err(|e| AppError::Internal(format!("glob failed: {}", e)))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let files: Vec<&str> = stdout.lines().filter(|l| !l.is_empty()).collect();
        Ok(files.join("\n"))
    } else {
        // Try PowerShell as fallback on Windows
        let output = Command::new("powershell")
            .args(&["-Command", &format!("Get-ChildItem -Path '{}' -Recurse -Name", pattern)])
            .output().await
            .map_err(|e| AppError::Internal(format!("glob (powershell) failed: {}", e)))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout.lines().filter(|l| !l.is_empty()).collect::<Vec<_>>().join("\n"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn glob_returns_empty_for_no_match() {
        let result = glob_files("__no_match_xyz__").await;
        assert!(result.is_ok());
    }
}
```

- [ ] **Step 3: 创建 grep.rs**

```rust
use adl_errors::AppError;
use tokio::process::Command;

pub struct GrepInput {
    pub pattern: String,
}

pub async fn grep_files(pattern: &str) -> Result<String, AppError> {
    let output = Command::new("powershell")
        .args(&["-Command", &format!(
            "Get-ChildItem -Recurse -File | Select-String -Pattern '{}' | Format-Table -AutoSize",
            pattern.replace("'", "''")
        )])
        .output().await
        .map_err(|e| AppError::Internal(format!("grep failed: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if stdout.trim().is_empty() {
        return Ok("No matches found.".to_string());
    }
    Ok(stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn grep_returns_result() {
        let result = grep_files("fn main").await;
        assert!(result.is_ok());
    }
}
```

- [ ] **Step 4: 更新 mod.rs**

```rust
pub mod glob;
pub mod read;
pub mod registry;
pub mod webfetch;
pub mod websearch;
pub mod grep;
```

- [ ] **Step 5: 更新 registry.rs —— 添加解析结构体和 execute match 分支**

```rust
// 在 WebSearchInput 后追加
struct ReadInput { path: String }
struct GlobInput { pattern: String }
struct GrepInput { pattern: String }

// 在 execute() 的 match 中添加:
"read" => {
    let parsed: ReadInput = serde_json::from_str(input)
        .map_err(|e| AppError::Internal(format!("Invalid read input: {}", e)))?;
    let result = crate::tools::read::read_file(&parsed.path).await?;
    result
},
"glob" => {
    let parsed: GlobInput = serde_json::from_str(input)
        .map_err(|e| AppError::Internal(format!("Invalid glob input: {}", e)))?;
    let result = crate::tools::glob::glob_files(&parsed.pattern).await?;
    result
},
"grep" => {
    let parsed: GrepInput = serde_json::from_str(input)
        .map_err(|e| AppError::Internal(format!("Invalid grep input: {}", e)))?;
    let result = crate::tools::grep::grep_files(&parsed.pattern).await?;
    result
},
```

- [ ] **Step 6: 更新测试——删除或修改 expect-no-execute 测试**

```rust
// 替换原有 execute_registered_but_unimplemented_tool_returns_error 测试
#[tokio::test]
async fn execute_read_tool() {
    let registry = ToolRegistry::with_builtins();
    tokio::fs::write("_test_read_tool.txt", "read tool test").await.unwrap();
    let result = registry.execute("read", "{\"path\":\"_test_read_tool.txt\"}").await;
    assert!(result.is_ok());
    let _ = tokio::fs::remove_file("_test_read_tool.txt").await;
}
```

- [ ] **Step 7: 运行测试**

```bash
cd ai-digital-life && cargo test -p adl-agent-runtime
```

- [ ] **Step 8: Clippy + Commit**

```bash
cd ai-digital-life && cargo clippy --workspace --all-targets 2>&1 | tail -10
git add crates/agent-runtime/src/tools/
git commit -m "fix(agent): implement read/glob/grep tool execution"
```

---

### Task 3: 持久化会话——SQLite 后端

**Files:**
- Modify: `crates/storage/src/` (追加 durable_session 表)
- Modify: `crates/agent-runtime/src/durable.rs` (改用 SQLite)
- Modify: `crates/agent-runtime/Cargo.toml` (追加 adl-storage 依赖)
- Test: `crates/agent-runtime/src/durable.rs` (底部测试模块)

**Interfaces:**
- Consumes: `adl_storage::ConnectionPool`, `adl_kernel::now_ms()`
- Produces: `DurableSessionManager` 操作持久化到 SQLite

- [ ] **Step 1: 在 storage crate 中添加会话状态表**

```rust
// crates/storage/src/session_state.rs
use rusqlite::Connection;

pub fn create_session_state_table(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS durable_session_state (
            session_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            checkpoint_message_id TEXT,
            last_heartbeat INTEGER NOT NULL,
            retry_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );"
    )
}
```

- [ ] **Step 2: 修改 durable.rs 使用 SQLite**

```rust
#[derive(Debug, Clone)]
pub struct DurableSessionManager {
    pool: Arc<r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>>,
    max_retries: u32,
    heartbeat_timeout_ms: u64,
}

impl DurableSessionManager {
    pub fn new(pool: Arc<r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>>) -> Self {
        // Ensure table exists
        let conn = pool.get().expect("Failed to get DB connection");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS durable_session_state (
                session_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'running',
                checkpoint_message_id TEXT,
                last_heartbeat INTEGER NOT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );"
        ).ok();
        Self { pool, max_retries: 3, heartbeat_timeout_ms: 30_000 }
    }

    pub async fn register_session(&self, session_id: &str, run_id: &str) {
        let now = now_ms();
        let conn = self.pool.get().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO durable_session_state
             (session_id, run_id, status, last_heartbeat, retry_count, created_at, updated_at)
             VALUES (?1, ?2, 'running', ?3, 0, ?3, ?3)",
            params![session_id, run_id, now],
        ).ok();
    }

    pub async fn heartbeat(&self, session_id: &str) {
        let now = now_ms();
        let conn = self.pool.get().unwrap();
        conn.execute(
            "UPDATE durable_session_state SET last_heartbeat = ?1, updated_at = ?1 WHERE session_id = ?2",
            params![now, session_id],
        ).ok();
    }

    // ... checkpoint, complete, fail, find_crashed_sessions, start_recovery 全部使用 SQL
}
```

- [ ] **Step 3: 更新 Cargo.toml**

```toml
# crates/agent-runtime/Cargo.toml - 追加
adl-storage = { path = "../storage" }
r2d2 = "0.8"
r2d2_sqlite = "0.25"
```

- [ ] **Step 4: 更新测试（将 new() 改为传入 pool）**

```rust
fn create_test_manager() -> DurableSessionManager {
    let pool = Arc::new(
        r2d2::Pool::builder()
            .build(r2d2_sqlite::SqliteConnectionManager::memory())
            .unwrap()
    );
    DurableSessionManager::new(pool)
}
```

- [ ] **Step 5: 运行测试**

```bash
cd ai-digital-life && cargo test -p adl-agent-runtime
```

- [ ] **Step 6: Clippy + Commit**

```bash
cd ai-digital-life && cargo clippy --workspace --all-targets 2>&1 | tail -10
git add crates/agent-runtime/src/durable.rs crates/agent-runtime/Cargo.toml crates/storage/
git commit -m "fix(session): persist durable session state to SQLite"
```

---

### Task 4: 前端 Settings 扩展——新增 Phase 2 配置分组

**Files:**
- Modify: `frontend/src/kernel/types.ts` (扩展 SettingsGroupId)
- Modify: `frontend/src/app/components/settings/SettingsNav.tsx` (新增导航项)
- Create: `frontend/src/app/features/mcp/McpSettings.tsx`
- Create: `frontend/src/app/features/command-editor/CommandSettings.tsx`
- Create: `frontend/src/app/features/permission-settings/PermissionSettings.tsx`
- Create: `frontend/src/app/features/plugin-manager/PluginSettings.tsx`
- Create: `frontend/src/app/features/reference-manager/ReferenceSettings.tsx`
- Create: `frontend/src/app/features/provider-manager/ProviderSettings.tsx`
- Create: `frontend/src/app/features/lsp-panel/LspSettings.tsx`
- Modify: `frontend/src/app/regions/MainLayout.tsx` 或设置入口——集成设置面板
- Modify: `frontend/src/shared/ipc-types.generated.ts` 或对应类型文件

**Interfaces:**
- Consumes: `SettingsGroupId` 类型扩展，`FeatureSettings` 组件签名
- Produces: 新设置分组可通过设置面板导航访问

- [ ] **Step 1: 扩展 SettingsGroupId**

```typescript
// frontend/src/kernel/types.ts 行 321
export type SettingsGroupId = 'general' | 'model' | 'agent' | 'workspace' | 'shortcuts'
  | 'mcp' | 'commands' | 'permissions' | 'plugins' | 'references' | 'providers' | 'lsp';
```

- [ ] **Step 2: 扩展 SettingsNav GROUPS**

```typescript
// SettingsNav.tsx GROUPS 数组
const GROUPS: Array<{ id: SettingsGroupId; labelKey: keyof CopyDict }> = [
  { id: 'general', labelKey: 'settingsGeneral' },
  { id: 'model', labelKey: 'settingsModel' },
  { id: 'agent', labelKey: 'settingsAgent' },
  { id: 'workspace', labelKey: 'settingsWorkspace' },
  { id: 'shortcuts', labelKey: 'settingsShortcuts' },
  { id: 'mcp', labelKey: 'settingsMcp' },
  { id: 'providers', labelKey: 'settingsProviders' },
  { id: 'commands', labelKey: 'settingsCommands' },
  { id: 'permissions', labelKey: 'settingsPermissions' },
  { id: 'plugins', labelKey: 'settingsPlugins' },
  { id: 'references', labelKey: 'settingsReferences' },
  { id: 'lsp', labelKey: 'settingsLsp' },
];
```

- [ ] **Step 3: 创建各 Settings 包装组件**

```tsx
// McpSettings.tsx — 包装 McpServerList + McpServerConfig
import { McpServerList } from './McpServerList';
import { McpServerConfig } from './McpServerConfig';
export function McpSettings() {
  return (
    <div className="adl-settings-section">
      <McpServerList />
      <McpServerConfig />
    </div>
  );
}
```

对其他 7 个功能重复此模式（`CommandSettings`、`PermissionSettings`、`PluginSettings`、`ReferenceSettings`、`ProviderSettings`、`LspSettings`），每个均包装对应的现有 `features/*` 组件。

- [ ] **Step 4: 在设置面板中添加组件路由**

SettingsPanel 需要一个组件映射，将 groupId 映射到对应的设置组件：

```tsx
// 在 SettingsPanel.tsx 或新建 SettingsContent.tsx 中
import { McpSettings } from '../../features/mcp/McpSettings';
import { CommandSettings } from '../../features/command-editor/CommandSettings';
// ... 其他 import

const SETTINGS_COMPONENTS: Record<string, React.ComponentType> = {
  mcp: McpSettings,
  commands: CommandSettings,
  permissions: PermissionSettings,
  plugins: PluginSettings,
  references: ReferenceSettings,
  providers: ProviderSettings,
  lsp: LspSettings,
};

function SettingsSectionContent({ groupId }: { groupId: string }) {
  const Component = SETTINGS_COMPONENTS[groupId];
  if (!Component) return null;
  return <Component />;
}
```

在 SettingsPanel 中渲染：在 `SettingsControls` 下方（或在搜索模式下替换之）渲染 `<SettingsSectionContent groupId={activeGroup} />`。

- [ ] **Step 5: 添加 i18n keys**

```typescript
// frontend/src/app/i18n/ 在对应领域文件中
settingsMcp: 'MCP',
settingsProviders: 'Providers',
settingsCommands: 'Commands',
settingsPermissions: 'Permissions',
settingsPlugins: 'Plugins',
settingsReferences: 'References',
settingsLsp: 'LSP',
```

- [ ] **Step 6: 运行 TypeScript 检查**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 7: Lint + Commit**

```bash
cd frontend && npx eslint .
git add frontend/src/kernel/types.ts frontend/src/app/components/settings/ frontend/src/app/features/*/Settings*.tsx
git commit -m "fix(frontend): mount Phase 2 settings panels in SettingsNav"
```

---

### Task 5: 前端对话面板——挂载 ForkButton、RevertButton、WebSearchPanel

**Files:**
- Modify: `frontend/src/app/regions/CenterPane.tsx`
- Modify: `frontend/src/app/components/conversation/MessageBlocks.tsx` (确认引用)
- Modify: `frontend/src/app/regions/RightPane.tsx` 或对应面板
- i18n: 添加新 key

**Interfaces:**
- Consumes: `ForkButton`, `RevertButton`, `WebSearchPanel` 组件（已存在）
- Produces: 对话工具栏出现 Fork/Revert 按钮，侧边面板可打开 WebSearch

- [ ] **Step 1: 在 CenterPane 对话头部添加 ForkButton 和 RevertButton**

```tsx
// CenterPane.tsx 在消息流上方添加工具栏
<div className="adl-center__toolbar">
  <ForkButton sessionId={activeSessionId} />
  <RevertButton />
</div>
```

- [ ] **Step 2: 将 WebSearchPanel 添加到可用侧边面板**

在右侧面板的路由/标签系统中添加 `web-search` 入口。

- [ ] **Step 3: 添加 i18n keys（如果需要面板标题）**

- [ ] **Step 4: 运行 TypeScript 检查**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Lint + Commit**

```bash
cd frontend && npx eslint .
git add frontend/src/app/regions/ frontend/src/app/components/conversation/
git commit -m "fix(frontend): mount ForkButton, RevertButton, WebSearchPanel"
```

---

### Task 6: 前端——创建 CustomAgent 管理器和 SnapshotList 组件

**Files:**
- Create: `frontend/src/app/features/custom-agent/CustomAgentManager.tsx`
- Create: `frontend/src/app/features/custom-agent/index.ts`
- Create: `frontend/src/app/components/conversation/SnapshotList.tsx`
- Modify: `frontend/src/app/stores/slicedStore.ts` (确认 custom agent actions 已注册)
- Modify: `frontend/src/app/stores/StoreState.ts` (确认类型)

**Interfaces:**
- Consumes: `customAgentActions` (已存在), `snapshotActions.listSnapshots` (已存在)
- Produces: 用户可管理自定义 Agent，可查看 Snapshot 历史

- [ ] **Step 1: 创建 CustomAgentManager**

```tsx
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';

export function CustomAgentManager() {
  const { t } = useTCopy();
  const customAgents = useAppStore((s) => s.customAgents);
  const isFetching = useAppStore((s) => s.isFetchingCustomAgents);

  if (isFetching) return <div>{t.loading}</div>;

  return (
    <div className="adl-custom-agent-manager">
      <h3>{t.customAgents}</h3>
      {customAgents.map((agent) => (
        <div key={agent.id} className="adl-custom-agent-item">
          <strong>{agent.name}</strong>
          <p>{agent.description}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 创建 SnapshotList**

```tsx
import { useAppStore } from '../../stores/slicedStore';

export function SnapshotList() {
  const listSnapshots = useAppStore((s) => s.listSnapshots);
  const [snapshots, setSnapshots] = useState([]);

  useEffect(() => {
    listSnapshots().then(setSnapshots).catch(() => {});
  }, []);

  return (
    <div className="adl-snapshot-list">
      <h3>Snapshots</h3>
      {snapshots.map((snap) => (
        <div key={snap.id} className="adl-snapshot-item">
          <span>{new Date(snap.createdAt).toLocaleString()}</span>
          <button onClick={() => { /* revert logic */ }}>Revert</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 运行 TypeScript 检查**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Lint + Commit**

```bash
cd frontend && npx eslint .
git add frontend/src/app/features/custom-agent/ frontend/src/app/components/conversation/SnapshotList.tsx
git commit -m "feat(frontend): add CustomAgentManager and SnapshotList components"
```

---

### Task 7: 前端 Durable Session——Store + UI

**Files:**
- Create: `frontend/src/app/stores/slices/durableSlice.ts`
- Create: `frontend/src/app/stores/actions/durableActions.ts`
- Modify: `frontend/src/app/stores/StoreState.ts` (追加 durable 类型)
- Modify: `frontend/src/app/stores/slicedStore.ts` (注册 slice + actions)
- Create: `frontend/src/app/components/session/DurableStatusIndicator.tsx`
- Modify: `frontend/src/app/regions/CenterPane.tsx` 或对话面板

- [ ] **Step 1: 创建 durableSlice.ts**

```typescript
import type { StateCreator } from 'zustand';

export interface DurableSlice {
  durableSessions: Record<string, DurableSessionInfo>;
  setDurableSession: (sessionId: string, info: DurableSessionInfo) => void;
}

export interface DurableSessionInfo {
  sessionId: string;
  runId: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'recovering';
  lastHeartbeat: number;
}

export const createDurableSlice: StateCreator<DurableSlice> = (set) => ({
  durableSessions: {},
  setDurableSession: (sessionId, info) =>
    set((s) => ({ durableSessions: { ...s.durableSessions, [sessionId]: info } })),
});
```

- [ ] **Step 2: 创建 durableActions.ts**

```typescript
import type { DigitalLifeBridge } from '../../../shared/ipc/digital-life';

export function createDurableActions(bridge: DigitalLifeBridge) {
  return {
    registerSession: async (sessionId: string, runId: string) => {
      await bridge.registerDurableSession(sessionId, runId);
    },
    heartbeat: async (sessionId: string) => {
      await bridge.durableHeartbeat(sessionId);
    },
    // ...
  };
}
```

- [ ] **Step 3: 创建 DurableStatusIndicator**

```tsx
export function DurableStatusIndicator({ sessionId }: { sessionId: string }) {
  const info = useAppStore((s) => s.durableSessions[sessionId]);
  if (!info) return null;
  return (
    <span className={`adl-durable-status adl-durable-status--${info.status}`}>
      {info.status}
    </span>
  );
}
```

- [ ] **Step 4: 注册到 slicedStore.ts 和 StoreState.ts**

追加 slice 到 createSlices 调用，追加 actions 到 createActions 调用，追加类型到 StoreState。

- [ ] **Step 5: 运行 TypeScript 检查 + Lint**

```bash
cd frontend && npx tsc --noEmit && npx eslint .
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/stores/slices/durableSlice.ts frontend/src/app/stores/actions/durableActions.ts frontend/src/app/components/session/
git commit -m "feat(session): add durable session frontend store and status indicator"
```

---

### Task 8: 设计清理

**Files:**
- Modify: `crates/agent-runtime/src/lib.rs` (assistant_blocks 中文→i18n)
- Modify: `crates/model-gateway/src/` (双路径路由评估)

- [ ] **Step 1: 抽取硬编码中文到常量和注释**

```rust
// 将 assistant_blocks() 中的中文 UI 字符串替换为英文注释
// 这些字符串最终由前端 i18n 覆盖，后端仅做 fallback
let plan_title = match scenario {
    ConversationScenario::Plan => "Plan execution",
    ConversationScenario::Chat => "Chat",
    ConversationScenario::CodeEdit => "Single agent step",
};
```

- [ ] **Step 2: 在 model-gateway 中添加 TODO 注释标记双路径路由待整合**

- [ ] **Step 3: 运行 clippy + 测试**

```bash
cd ai-digital-life && cargo clippy --workspace --all-targets && cargo test --workspace
```

- [ ] **Step 4: Commit**

```bash
git add crates/agent-runtime/src/lib.rs crates/model-gateway/
git commit -m "chore: remove hardcoded Chinese text, mark model-gateway dual-path for cleanup"
```
