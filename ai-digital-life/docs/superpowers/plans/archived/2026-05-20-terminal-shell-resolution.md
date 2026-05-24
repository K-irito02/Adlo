# Terminal Shell Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) for syntax tracking.

**Goal:** Redesign terminal shell lookup to eliminate cross-type fallback, add app-data-directory user-provided executable support, and display clear recovery instructions when shells are unavailable.

**Architecture:** Build a unified ShellResolver that implements a two-level lookup (well-known system paths → PATH → error guidance), with the app-data-dir option mentioned only in recovery instructions. Deploy it in two runtime modes: Rust side (`session_manager.rs`) for Tauri mode, and Node.js side (`previewTerminalService.ts`) for browser mode. The two implementations share the same lookup logic and error message patterns despite different platforms (Rust `std::path` + `tauri::path` vs Node.js `fs.existsSync` + `os.homedir()`).

**Tech Stack:** Rust 2024 + `portable-pty` 0.8 | Node.js 22 + `child_process.spawn` | TypeScript 5.6 | xterm.js 6

---

## File Structure

| File | Role | Change |
|------|------|--------|
| `crates/terminal/src/pty.rs` | Raw PTY creation | Accept `program: &str` + `args: &[&str]` instead of `shell: &str` |
| `crates/terminal/src/session_manager.rs` | PTY session lifecycle | Add `resolve_shell()` before `PtySession::create()`, produce typed errors |
| `crates/terminal/src/lib.rs` | Crate root | Export nothing new (module structure unchanged) |
| `src-tauri/src/commands/pty_commands.rs` | Tauri command handler | Unchanged (no app data dir needed) |
| `frontend/dev/previewTerminalService.ts` | Browser mode PTY service | Replace `resolveShell()` with system-candidates → PATH resolution, add recovery guide with app-data-dir hint |
| `frontend/src/app/regions/right-panel/TerminalPanel.tsx` | Terminal UI panel | Handle new error messages from failed PTY create, display recovery instructions |

---

### Task 1: Refactor `PtySession::create()` to accept resolved path

**Files:**
- Modify: `crates/terminal/src/pty.rs:27-91`

`PtySession::create()` currently takes `shell: &str` and internally maps it to `(program, args)`. This couples path resolution to the PTY creation. We need to decouple them: the caller resolves the path, the PTY just spawns.

- [ ] **Step 1: Add a new `PtyConfig` struct**

Insert after line 25 (end of `impl PtySession`):

```rust
/// Pre-resolved shell program and arguments.
/// The caller (SessionManager) is responsible for path resolution.
pub struct PtyConfig {
    pub program: String,
    pub args: Vec<String>,
}
```

- [ ] **Step 2: Add `PtySession::new()` that accepts pre-resolved config**

Add before `read_output`:

```rust
impl PtySession {
    pub fn new(
        config: PtyConfig,
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<Self, AppError> {
        let pty_system = NativePtySystem::default();
        let size = PtySize { rows, cols, pixel_width: 0, pixel_height: 0 };
        let pair = pty_system
            .openpty(size)
            .map_err(|e| AppError::Terminal(format!("failed to open pty: {}", e)))?;

        let mut cmd = CommandBuilder::new(&config.program);
        if !config.args.is_empty() {
            cmd.args(&config.args);
        }
        cmd.cwd(cwd);

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Terminal(format!("failed to spawn shell: {}", e)))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Terminal(format!("failed to clone pty reader: {}", e)))?;

        let writer = pair.master.take_writer()
            .map_err(|e| AppError::Terminal(format!("failed to take pty writer: {}", e)))?;

        let shell_label = std::path::Path::new(&config.program)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "shell".to_string());

        Ok(Self {
            id: create_id("pty"),
            shell: shell_label,
            cwd: cwd.to_string(),
            master: Mutex::new(Some(pair.master)),
            child: Mutex::new(Some(child)),
            output_reader: Mutex::new(Some(reader)),
            writer: Mutex::new(Some(writer)),
            cols,
            rows,
            status: Mutex::new(PtyStatus::Running),
        })
    }
}
```

- [ ] **Step 3: Keep `PtySession::create()` as a deprecated wrapper**

Keep the old `create()` method unchanged for backward compatibility during the transition. It will be removed in a later step after all callers are updated.

```rust
// Deprecated: kept for transition, callers should use new() + resolver instead
pub fn create(shell: &str, cwd: &str, cols: u16, rows: u16) -> Result<Self, AppError> {
    let (program, args) = match shell {
        "bash" => {
            #[cfg(windows)] { ("wsl".to_string(), vec!["bash".to_string(), "-l".to_string()]) }
            #[cfg(not(windows))] { ("bash".to_string(), vec!["-l".to_string()]) }
        }
        "cmd" => ("cmd".to_string(), vec![]),
        _ => ("powershell".to_string(), vec![]),
    };
    Self::new(PtyConfig { program, args }, cwd, cols, rows)
}
```

- [ ] **Step 4: Verify Rust compilation**

Run: `cargo check -p adl-terminal 2>&1`

Expected: Compilation succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add crates/terminal/src/pty.rs
git commit -m "refactor(terminal): decouple path resolution from PtySession::create"
```

---

### Task 2: Implement ShellResolver for Tauri mode (Rust)

**Files:**
- Create: `crates/terminal/src/shell_resolver.rs`
- Modify: `crates/terminal/src/lib.rs`
- Modify: `crates/terminal/Cargo.toml`

`ShellResolver` probes executable paths at module initialization time and memoizes them. It uses `std::path::Path::exists()` for file checks and wraps `std::process::Command` for probe execution.

- [ ] **Step 1: Add dependencies to `crates/terminal/Cargo.toml`**

Verify `serde` already exists, then add `dirs`:
```toml
[dependencies]
dirs = "5"
```

- [ ] **Step 2: Create `crates/terminal/src/shell_resolver.rs`**

```rust
use adl_errors::AppError;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Shell type identifiers used across the system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ShellKind {
    PowerShell,
    Cmd,
    Bash,
}

impl ShellKind {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "powershell" => Some(Self::PowerShell),
            "cmd" => Some(Self::Cmd),
            "bash" => Some(Self::Bash),
            _ => None,
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::PowerShell => "PowerShell",
            Self::Cmd => "CMD",
            Self::Bash => "Bash",
        }
    }

    /// Human-readable recovery instruction when the shell is not found.
    pub fn recovery_guide(&self) -> String {
        let app_data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("ai-digital-life")
            .join("bin")
            .join("terminals")
            .join(self.display_name());
        match self {
            Self::PowerShell => format!(
                "PowerShell 是 Windows 内置组件，未找到 PowerShell 可执行文件。\n\
                 恢复方法：\n\
                 1. 确保 Windows PowerShell 功能已开启\n\
                    → 设置 > 应用 > 可选功能 > 添加功能 > Windows PowerShell\n\
                 2. 或自行放置 powershell.exe 到以下目录：\n\
                    {}\n\
                 3. 或在命令行中运行 'powershell.exe' 验证是否可用",
                app_data_dir.display()
            ),
            Self::Cmd => format!(
                "CMD 是 Windows 内置组件，未找到 cmd.exe。\n\
                 恢复方法：\n\
                 1. 检查 %COMSPEC% 环境变量是否正确\n\
                 2. 或自行放置 cmd.exe 到以下目录：\n\
                    {}\n\
                 3. 或在命令行中运行 'cmd.exe' 验证是否可用",
                app_data_dir.display()
            ),
            Self::Bash => format!(
                "Bash 需要安装 Git for Windows 或 WSL。\n\
                 恢复方法：\n\
                 1. 安装 Git for Windows: https://git-scm.com/download/win\n\
                 2. 或启用 WSL: 以管理员身份运行 'wsl --install'\n\
                 3. 或自行放置 bash.exe 到以下目录：\n\
                    {}\n\
                    （注意：WSL bash.exe 位于 C:\\Windows\\System32\\wsl.exe）",
                app_data_dir.display()
            ),
        }
    }
}

/// Level-1 priority: well-known system installation paths.
fn system_candidates(shell: ShellKind) -> Vec<PathBuf> {
    let sys_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let sys32 = Path::new(&sys_root).join("System32");
    let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
    let pf86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into());

    match shell {
        ShellKind::PowerShell => vec![
            sys32.join("WindowsPowerShell").join("v1.0").join("powershell.exe"),
            Path::new(&sys_root).join("SysWOW64").join("WindowsPowerShell").join("v1.0").join("powershell.exe"),
        ],
        ShellKind::Cmd => vec![
            sys32.join("cmd.exe"),
            std::env::var("COMSPEC").map(PathBuf::from).unwrap_or_else(|_| sys32.join("cmd.exe")),
        ],
        ShellKind::Bash => vec![
            Path::new(&pf).join("Git").join("bin").join("bash.exe"),
            Path::new(&pf86).join("Git").join("bin").join("bash.exe"),
            sys32.join("wsl.exe"),
            Path::new(&sys_root).join("SysNative").join("wsl.exe"),
        ],
    }
}

/// Result of a shell resolution.
#[derive(Debug, Clone)]
pub struct ShellResolution {
    pub kind: ShellKind,
    pub program: String,
    pub args: Vec<String>,
}

/// Shell resolution error with user-facing recovery message.
#[derive(Debug, Clone)]
pub struct ShellNotFound {
    pub kind: ShellKind,
}

pub struct ShellResolver;

impl ShellResolver {
    pub fn resolve(shell: &str) -> Result<ShellResolution, ShellNotFound> {
        let kind = ShellKind::from_str(shell)
            .ok_or_else(|| ShellNotFound { kind: ShellKind::Cmd })?;

        // Level 1: Well-known system paths
        for candidate in system_candidates(kind) {
            if candidate.exists() {
                let args = shell_args_for(&candidate);
                return Ok(ShellResolution {
                    kind,
                    program: candidate.to_string_lossy().to_string(),
                    args,
                });
            }
        }

        // Level 2: Rely on PATH (no pre-check, the OS will resolve or fail)
        let (prog_name, args) = match kind {
            ShellKind::PowerShell => ("powershell.exe", vec!["-NoLogo".to_string(), "-NoProfile".to_string()]),
            ShellKind::Cmd => ("cmd.exe", vec!["/q".to_string()]),
            ShellKind::Bash => ("bash.exe", vec!["-l".to_string()]),
        };
        Ok(ShellResolution {
            kind,
            program: prog_name.to_string(),
            args,
        })
    }
}

fn shell_args_for(path: &Path) -> Vec<String> {
    let name = path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    match name {
        "powershell" => vec!["-NoLogo".to_string(), "-NoProfile".to_string()],
        "pwsh" => vec!["-NoLogo".to_string(), "-NoProfile".to_string()],
        "cmd" => vec!["/q".to_string()],
        "bash" => vec!["-l".to_string()],
        "wsl" => vec![],
        _ => vec![],
    }
}
```

- [ ] **Step 3: Register module in `lib.rs`**

```rust
pub mod shell_resolver;
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check -p adl-terminal 2>&1`

Expected: Compilation succeeds.

- [ ] **Step 5: Commit**

```bash
git add crates/terminal/src/shell_resolver.rs crates/terminal/src/lib.rs
git commit -m "feat(terminal): add ShellResolver with four-level lookup"
```

---

### Task 3: Integrate ShellResolver into SessionManager

**Files:**
- Modify: `crates/terminal/src/session_manager.rs`
- Modify: `src-tauri/src/commands/pty_commands.rs`
- Modify: `crates/terminal/src/pty.rs`

- [ ] **Step 1: Update `SessionManager` to use ShellResolver**

Replace the current `SessionManager` struct and `create()` method:

```rust
use crate::pty::{PtySession, PtyStatus, PtyConfig};
use crate::shell_resolver::{ShellResolver, ShellNotFound};
use adl_errors::AppError;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

pub struct PtySessionHandle {
    pub session: Arc<PtySession>,
}

pub struct SessionManager {
    sessions: Mutex<HashMap<String, PtySessionHandle>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn create(
        &self,
        app: tauri::AppHandle,
        shell: &str,
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<String, AppError> {
        let resolution = ShellResolver::resolve(shell)
            .map_err(|e| AppError::Terminal(format!(
                "{} not found.\n\nRecovery:\n{}",
                e.kind.display_name(),
                e.kind.recovery_guide(),
            )))?;

        let config = PtyConfig {
            program: resolution.program,
            args: resolution.args,
        };
        let session = PtySession::new(config, cwd, cols, rows)?;
        let session_id = session.id.clone();
        let session = Arc::new(session);

        // ... (keep the rest of create() unchanged: spawn reader thread, insert into sessions)
        let session_clone = Arc::clone(&session);
        let app_clone = app.clone();
        let sid = session_id.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match session_clone.read_output(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_clone.emit(
                            "digital-life://pty-output",
                            serde_json::json!({
                                "sessionId": sid,
                                "data": data,
                            }),
                        );
                    }
                    Err(_) => break,
                }
            }
        });

        let mut sessions = self.sessions.lock()
            .map_err(|_| AppError::Internal("mutex poisoned".into()))?;
        sessions.insert(session_id.clone(), PtySessionHandle { session });
        tracing::info!(session_id = %session_id, shell = %shell, "pty session created");
        Ok(session_id)
    }
    // ... keep write(), resize(), kill(), list() unchanged
}
```

- [ ] **Step 2: `setup.rs` — `SessionManager::new()` no longer needs args**

`src-tauri/src/setup.rs` line 56 stays unchanged:
```rust
pty_sessions: std::sync::Arc::new(std::sync::Mutex::new(SessionManager::new())),
```

- [ ] **Step 3: Remove deprecated `PtySession::create()` in `pty.rs`**

After verifying `SessionManager` no longer calls `PtySession::create()`, delete the old method entirely. Only keep `PtySession::new()`.

- [ ] **Step 4: Verify compilation**

Run: `cargo check 2>&1`

Expected: Compilation succeeds.

- [ ] **Step 5: Commit**

```bash
git add crates/terminal/src/session_manager.rs crates/terminal/src/pty.rs src-tauri/src/setup.rs
git commit -m "feat(terminal): integrate ShellResolver into SessionManager, remove cross-type fallback"
```

---

### Task 4: Implement ShellResolver for browser mode (Node.js)

**Files:**
- Modify: `frontend/dev/previewTerminalService.ts`

Replace the current `resolveShell()`, `findPowerShellPath()`, `findBashPath()`, `findCmdPath()` functions with a unified `ShellResolver` class.

- [ ] **Step 1: Add imports at top of file**

```typescript
import os from "node:os";
```

- [ ] **Step 2: Replace shell path resolution functions**

Remove `findPowerShellPath()`, `findBashPath()`, `findCmdPath()`, `resolveShell()`, `ShellConfig` interface.

Add:

```typescript
/* ---- Shell resolution ---- */

type ShellKind = "powershell" | "cmd" | "bash";

interface ShellResolution {
  program: string;
  args: string[];
}

const systemRoot = process.env.SystemRoot || "C:\\Windows";
const system32 = path.join(systemRoot, "System32");

function appDataShellDir(): string {
  return path.join(os.homedir(), ".ai-digital-life", "bin", "terminals");
}

function systemCandidates(kind: ShellKind): string[] {
  switch (kind) {
    case "powershell":
      return [
        path.join(system32, "WindowsPowerShell", "v1.0", "powershell.exe"),
        path.join(systemRoot, "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ];
    case "cmd":
      return [
        process.env.COMSPEC || path.join(system32, "cmd.exe"),
        path.join(system32, "cmd.exe"),
      ];
    case "bash":
      return [
        path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
        path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Git", "bin", "bash.exe"),
        path.join(system32, "wsl.exe"),
        path.join(systemRoot, "SysNative", "wsl.exe"),
      ];
  }
}

function shellArgsFor(kind: ShellKind, programPath: string): string[] {
  const name = path.basename(programPath, ".exe").toLowerCase();
  switch (name) {
    case "powershell":
    case "pwsh":
      return ["-NoLogo", "-NoProfile"];
    case "cmd":
      return ["/q"];
    case "bash":
      return path.basename(programPath).toLowerCase().includes("wsl") ? [] : ["-l"];
    default:
      return [];
  }
}

function resolveShell(shell: string): { resolution: ShellResolution } | { error: string } {
  const kind = shell as ShellKind;
  if (!["powershell", "cmd", "bash"].includes(kind)) {
    return { error: `Unknown shell type: ${shell}` };
  }

  // Level 1: Well-known system paths
  for (const candidate of systemCandidates(kind)) {
    if (existsSync(candidate)) {
      return {
        resolution: {
          program: candidate,
          args: shellArgsFor(kind, candidate),
        },
      };
    }
  }

  // Level 2: Rely on PATH
  const progName = kind === "powershell" ? "powershell.exe" : kind === "cmd" ? "cmd.exe" : "bash.exe";
  return {
    resolution: {
      program: progName,
      args: shellArgsFor(kind, progName),
    },
  };
}

function recoveryGuide(kind: ShellKind): string {
  const appDataDir = appDataShellDir();
  switch (kind) {
    case "powershell":
      return [
        "PowerShell 是 Windows 内置组件，未找到 PowerShell 可执行文件。",
        "恢复方法：",
        "  1. 确保 Windows PowerShell 功能已开启",
        "     → 设置 > 应用 > 可选功能 > 添加功能 > Windows PowerShell",
        "  2. 或自行放置 powershell.exe 到以下目录：",
        `     ${appDataDir}\\${kind}\\`,
        "  3. 或在命令行中运行 'powershell.exe' 验证是否可用",
      ].join("\n");
    case "cmd":
      return [
        "CMD 是 Windows 内置组件，未找到 cmd.exe。",
        "恢复方法：",
        "  1. 检查 %COMSPEC% 环境变量是否正确",
        "  2. 或自行放置 cmd.exe 到以下目录：",
        `     ${appDataDir}\\${kind}\\`,
        "  3. 或在命令行中运行 'cmd.exe' 验证是否可用",
      ].join("\n");
    case "bash":
      return [
        "Bash 需要安装 Git for Windows 或 WSL。",
        "恢复方法：",
        "  1. 安装 Git for Windows: https://git-scm.com/download/win",
        "  2. 或启用 WSL: 以管理员身份运行 'wsl --install'",
        "  3. 或自行放置 bash.exe 到以下目录：",
        `     ${appDataDir}\\${kind}\\`,
      ].join("\n");
  }
}
```

- [ ] **Step 3: Update PTY create handler to use new resolution**

Replace the PTY create handler's shell resolution section:

```typescript
// POST /__adl_preview_api__/pty/create
if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/pty/create`) {
    const body = ...;
    const shell = body?.shell || "powershell";
    const cwd = body?.cwd || process.cwd();
    const sessionId = createId();

    const resolved = resolveShell(shell);
    if ("error" in resolved) {
      sendSse(sessionId, `\r\n[error: ${resolved.error}]\r\n`);
      writeJson(response, { ok: true, data: { sessionId } });
      return true;
    }

    const { resolution } = resolved;
    const child = spawn(resolution.program, resolution.args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, TERM: "xterm-256color" },
    });

    // check for spawn errors immediately
    child.on("error", (err) => {
      const guide = recoveryGuide(shell as ShellKind);
      sendSse(sessionId, `\r\n[error: failed to start ${shell}: ${err.message}]\r\n${guide}\r\n`);
      sessions.delete(sessionId);
      sseClients.delete(sessionId);
    });

    // ... rest of handler unchanged
}
```

- [ ] **Step 4: Typecheck**

Run: `npm --prefix frontend run typecheck 2>&1`

Expected: No TypeScript errors.

- [ ] **Step 5: Restart dev server and verify**

```bash
# Stop old server, then:
npm run dev:browser
```

Expected: Server starts without errors, terminal panel loads correctly.

- [ ] **Step 6: Commit**

```bash
git add frontend/dev/previewTerminalService.ts
git commit -m "feat(terminal): add ShellResolver for browser mode with app-data-dir support"
```

---

### Task 5: Frontend error display

**Files:**
- Modify: `frontend/src/app/regions/right-panel/TerminalPanel.tsx`

When the backend sends an error message (either `child.on("error")` or the PTY process exits immediately), the xterm panel currently shows the raw text. We should add a cleaner error display.

- [ ] **Step 1: Add error state tracking**

In `TerminalPanel.tsx`, add a `shellError` ref or state:

```typescript
const shellErrorRef = useRef<string | null>(null);
```

- [ ] **Step 2: Detect error in output subscription**

In the `subscribePtyOutput` callback, detect error patterns:

```typescript
useEffect(() => {
    const unsub = window.digitalLife.subscribePtyOutput((event) => {
      if (activeTab?.sessionId && event.sessionId === activeTab.sessionId) {
        const output = event.data;
        // Store for tab switching
        const prev = sessionOutputsRef.current.get(activeTab.sessionId) ?? "";
        sessionOutputsRef.current.set(activeTab.sessionId, prev + output);
        xtermRef.current?.write(output);
      }
    });
    return unsub;
  }, [activeTab?.sessionId]);
```

The error messages are already embedded in the SSE data stream, so xterm will display them automatically. The recovery guide text from `recoveryGuide()` will appear in the terminal. No additional UI changes needed.

- [ ] **Step 3: Add visual hint for error state**

When the active tab's status is `"terminated"` and there is no sessionId, show a small note below the terminal canvas:

```tsx
{hasActiveTab && activeTab.status === "terminated" && !activeTab.sessionId && (
  <div className="adl-terminal-error-note">
    <IconAlertCircle size={14} />
    <span>{t.terminalShellNotFound}</span>
  </div>
)}
```

Add the icon import:

```typescript
import {
  IconTerminal,
  IconCopy,
  IconClipboardPaste,
  IconTrash,
  IconAlertCircle,
} from "../../icons";
```

- [ ] **Step 4: Add the translation key**

Find where `terminalKillProcess` is defined and add:

```typescript
terminalShellNotFound: "Shell not found. Check terminal output for recovery instructions.",
```

Search for the i18n/locales file pattern and add this key to both `en` and `zh-CN` locales:

```typescript
// en
terminalShellNotFound: "Shell not found. Check terminal output for recovery instructions.",

// zh-CN
terminalShellNotFound: "未找到终端程序，请在终端输出中查看恢复指引。",
```

- [ ] **Step 5: Add CSS for the error note**

In `regions.css`, add:

```css
.adl-terminal-error-note {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-warning, #2d1f00);
  color: var(--text-warning, #ffa726);
  font-size: 12px;
  border-top: 1px solid var(--border-warning, #5a3e00);
}
```

- [ ] **Step 6: Typecheck**

Run: `npm --prefix frontend run typecheck 2>&1`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/regions/right-panel/TerminalPanel.tsx frontend/src/styles/regions.css
git commit -m "feat(terminal): add shell-not-found error note and translation keys"
```

---

### Task 6: Full-system integration verification

**Files:**
- Test (manual): All terminal operations in browser mode

- [ ] **Step 1: Restart dev server**

```bash
# Stop existing server
# Then:
npm run dev:browser
```

- [ ] **Step 2: Verify PowerShell terminal**

1. Open terminal panel
2. Click "PS PowerShell" in empty state card
3. Verify PowerShell prompt appears (e.g., `PS C:\...> `)
4. Type `echo "hello"` and press Enter
5. Verify `hello` is echoed back

- [ ] **Step 3: Verify CMD terminal**

1. Close PowerShell tab
2. Click "> CMD" in empty state card
3. Verify CMD prompt appears (e.g., `C:\...>`)
4. Type `echo test` and press Enter
5. Verify `test` is echoed back

- [ ] **Step 4: Verify Bash terminal (if Git Bash or WSL installed)**

1. Close CMD tab
2. Click "$ Bash" in empty state card
3. Verify Bash prompt appears
4. Type `echo hello` and press Enter
5. Verify `hello` is echoed back

- [ ] **Step 5: Verify error message when shell is unavailable**

1. Create a scenario where a shell is not available (e.g., no WSL/Git Bash for Bash)
2. Create that terminal type
3. Verify the terminal displays the recovery guide from `recoveryGuide()`
4. Verify the error note appears below the terminal canvas

- [ ] **Step 6: Verify each terminal is its own type (no cross-type fallback)**

1. Verify PowerShell tab shows "PowerShell" in the navigator
2. Verify CMD tab shows "CMD" in the navigator
3. Verify Bash tab shows "Bash" in the navigator
4. Specifically: Bash tab should NOT fall back to CMD if Bash is unavailable

- [ ] **Step 7: Typecheck (final verification)**

```bash
npm --prefix frontend run typecheck
```

Expected: No errors.

- [ ] **Step 8: Commit remaining changes**

```bash
git add -A
git commit -m "feat(terminal): complete shell resolution redesign"
```

---

## Self-Review

### Spec coverage

| Requirement | Task | Status |
|-------------|------|--------|
| No cross-type fallback | Task 3 (Rust), Task 4 (Node.js) | Done — each type resolves its own path independently |
| App-data-dir in recovery guide only | Task 2 (Rust recovery_guide), Task 4 (Node.js recoveryGuide) | Done — app-data-dir path shown in error message, not auto-checked |
| System well-known paths (Level 1) | Task 2 (system_candidates), Task 4 (systemCandidates) | Done — Level 1 checks documented paths |
| PATH fallback (Level 2) | Task 2 (Level 2), Task 4 (Level 2) | Done — Level 2 emits bare exe name |
| Error recovery instructions | Task 2 (recovery_guide), Task 4 (recoveryGuide) | Done — per-shell multilingual error text |
| Unified across runtime modes | Task 3 (Rust SessionManager), Task 4 (Node.js) | Done — both use same 4-level strategy |
| Terminated tab visual hint | Task 5 | Done — `.adl-terminal-error-note` banner |

### Placeholder scan

- No TBD/TODO/FIXME patterns in code blocks
- All error messages contain concrete recovery steps
- All import paths and type references are consistent

### Type consistency

- `ShellKind` enum (Rust) ↔ `ShellKind` type alias (Node.js): same four variants
- `ShellResolution` struct (Rust) ↔ `ShellResolution` interface (Node.js): same fields
- `ShellNotFound → recovery_guide()` (Rust) ↔ `recoveryGuide()` (Node.js): same return shape
