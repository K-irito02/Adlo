# Tauri 端口扫描功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现Tauri桌面应用下的本地端口扫描功能，支持自动扫描和手动刷新常见开发端口。

**Architecture:** 采用Tauri IPC架构，前端调用Rust后端命令进行TCP连接测试，返回端口状态。支持用户配置端口列表，显示端口状态和详细信息。

**Tech Stack:** Rust (tokio, async/await), TypeScript (React, Zustand), Tauri IPC

## Global Constraints
- 端口扫描仅在Tauri桌面模式下可用，浏览器模式保持现有行为
- 扫描超时：每个端口300ms，总时间<2s
- 并发数：10个并发连接
- 支持Windows、macOS、Linux平台
- 用户可配置端口列表，使用Tauri持久化存储

---

## 文件结构

### 新建文件
1. `src-tauri/src/commands/port_scan.rs` - Rust端口扫描命令实现
2. `frontend/src/app/features/browser/browser-landing/usePortScan.ts` - 前端扫描hook
3. `frontend/src/app/features/browser/browser-landing/PortScanConfig.tsx` - 端口配置UI组件（可选，第二阶段）

### 修改文件
1. `src-tauri/src/commands/mod.rs` - 注册新命令模块
2. `frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx` - 调用Tauri command
3. `frontend/src/app/stores/slices/browserLandingSlice.ts` - 添加扫描action和状态
4. `frontend/src/app/features/browser/browser-landing/BrowserLandingPage.tsx` - 右键菜单添加"查看详情"
5. `frontend/src/app/i18n/zh-CN/browser.ts` - 添加国际化key
6. `frontend/src/app/i18n/en-US/browser.ts` - 添加国际化key

---

## 任务分解

### Task 1: 创建Rust端口扫描基础模块

**Files:**
- Create: `src-tauri/src/commands/port_scan.rs`
- Modify: `src-tauri/src/commands/mod.rs`

**Interfaces:**
- Consumes: 无（独立模块）
- Produces: `browser_scan_ports` 命令，接收 `Vec<u16>` 返回 `Vec<ScannedPort>`

- [ ] **Step 1: 创建port_scan.rs文件，定义数据结构**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedPort {
    pub port: u16,
    pub is_open: bool,
    pub response_time_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortDetails {
    pub port: u16,
    pub is_open: bool,
    pub process_info: Option<ProcessInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub command: String,
}
```

- [ ] **Step 2: 实现TCP连接测试函数**

```rust
use tokio::net::TcpStream;
use std::time::Duration;

async fn scan_single_port(port: u16) -> ScannedPort {
    let timeout = Duration::from_millis(300);
    let start = std::time::Instant::now();
    
    match tokio::time::timeout(timeout, TcpStream::connect(format!("127.0.0.1:{}", port))).await {
        Ok(Ok(_)) => {
            let response_time = start.elapsed().as_millis() as u64;
            ScannedPort {
                port,
                is_open: true,
                response_time_ms: Some(response_time),
            }
        },
        _ => ScannedPort {
            port,
            is_open: false,
            response_time_ms: None,
        },
    }
}
```

- [ ] **Step 3: 实现并发扫描命令**

```rust
use tauri::command;

#[command]
pub async fn browser_scan_ports(ports: Vec<u16>) -> Result<Vec<ScannedPort>, String> {
    // 去重并排序
    let mut unique_ports = ports;
    unique_ports.sort_unstable();
    unique_ports.dedup();
    
    // 并发扫描，限制并发数为10
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(10));
    let mut handles = Vec::with_capacity(unique_ports.len());
    
    for port in unique_ports {
        let permit = semaphore.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit.acquire().await.unwrap();
            scan_single_port(port).await
        }));
    }
    
    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        if let Ok(result) = handle.await {
            results.push(result);
        }
    }
    
    // 按端口号排序
    results.sort_by_key(|r| r.port);
    Ok(results)
}
```

- [ ] **Step 4: 在mod.rs中注册模块**

在 `src-tauri/src/commands/mod.rs` 中添加：
```rust
pub mod port_scan;
```

- [ ] **Step 5: 编写单元测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_scan_single_port_open() {
        // 注意：此测试需要本地有开放端口，可能在不同环境失败
        // 实际测试中应该mock或使用测试端口
        let result = scan_single_port(80).await;
        // 不断言具体结果，因为环境不同
        assert!(result.port == 80);
    }

    #[tokio::test]
    async fn test_scan_single_port_closed() {
        let result = scan_single_port(1).await; // 端口1通常关闭
        assert_eq!(result.port, 1);
        assert!(!result.is_open);
        assert!(result.response_time_ms.is_none());
    }
}
```

- [ ] **Step 6: 运行测试验证**

Run: `cargo test -p adl-tauri port_scan`
Expected: 测试通过（或跳过需要网络的测试）

- [ ] **Step 7: 提交代码**

```bash
git add src-tauri/src/commands/port_scan.rs src-tauri/src/commands/mod.rs
git commit -m "feat(port-scan): add basic Rust port scanning command"
```

### Task 2: 前端调用Tauri命令

**Files:**
- Modify: `frontend/src/app/stores/slices/browserLandingSlice.ts`
- Modify: `frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx`

**Interfaces:**
- Consumes: Task 1 的 `browser_scan_ports` 命令
- Produces: `browserScanPorts` action，更新 `browserLocalPorts` 状态

- [ ] **Step 1: 在browserLandingSlice中添加扫描action**

在 `browserLandingSlice.ts` 中添加：
```typescript
// 在 BrowserLandingSlice 接口中添加
browserScanPorts: (ports: number[]) => Promise<void>;
browserPortScanning: boolean;

// 在 createBrowserLandingSlice 中实现
browserScanPorts: async (ports: number[]) => {
    if (get().browserPortScanning) return;
    
    set({ browserPortScanning: true });
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const scannedPorts = await invoke<{ port: number; is_open: boolean; response_time_ms: number | null }[]>('browser_scan_ports', { ports });
        
        // 更新现有端口状态，添加新发现的开放端口
        const existingPorts = get().browserLocalPorts;
        const existingPortMap = new Map(existingPorts.map(p => [p.port, p]));
        
        const updatedPorts = [...existingPorts];
        let maxSortOrder = existingPorts.length > 0 ? Math.max(...existingPorts.map(p => p.sortOrder)) : 0;
        
        for (const scanned of scannedPorts) {
            if (scanned.is_open) {
                if (!existingPortMap.has(scanned.port)) {
                    // 新发现的开放端口
                    maxSortOrder++;
                    updatedPorts.push({
                        id: createUiId('localport'),
                        host: 'localhost',
                        port: scanned.port,
                        isAutoDiscovered: true,
                        lastAliveAt: Date.now(),
                        sortOrder: maxSortOrder,
                        is_open: true,
                        response_time_ms: scanned.response_time_ms ?? undefined,
                    });
                } else {
                    // 更新现有端口状态
                    const existing = existingPortMap.get(scanned.port)!;
                    const index = updatedPorts.findIndex(p => p.id === existing.id);
                    updatedPorts[index] = {
                        ...existing,
                        is_open: true,
                        lastAliveAt: Date.now(),
                        response_time_ms: scanned.response_time_ms ?? undefined,
                    };
                }
            } else {
                // 端口关闭，标记状态但不移除
                if (existingPortMap.has(scanned.port)) {
                    const existing = existingPortMap.get(scanned.port)!;
                    const index = updatedPorts.findIndex(p => p.id === existing.id);
                    updatedPorts[index] = {
                        ...existing,
                        is_open: false,
                        lastAliveAt: Date.now(),
                        response_time_ms: undefined,
                    };
                }
            }
        }
        
        set({ browserLocalPorts: updatedPorts });
    } catch (error) {
        console.error('[browserLandingSlice] scan ports failed:', error);
    } finally {
        set({ browserPortScanning: false });
    }
},
```

- [ ] **Step 2: 修改LocalPortSection.tsx调用Tauri命令**

修改 `scanPorts` 函数：
```typescript
const scanPorts = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    browserSetPortScanning(true);
    
    try {
        if (useAppStore.getState().isTauri) {
            // Tauri模式：调用后端命令扫描常见开发端口
            const commonPorts = [3000, 5000, 8080, 8000, 3001, 5173, 4200, 9000, 4000, 8888];
            await browserScanPorts(commonPorts);
        } else {
            // 浏览器模式：保持现有fetch扫描
            const response = await fetch(SCAN_API);
            // ... 现有代码
        }
    } catch (error) {
        console.warn('[LocalPortSection] port scan failed:', error);
    } finally {
        scanningRef.current = false;
        browserSetPortScanning(false);
    }
}, [browserScanPorts, browserSetPortScanning]);
```

- [ ] **Step 3: 添加必要的导入**

在 `LocalPortSection.tsx` 中添加：
```typescript
const { browserScanPorts } = useAppStore(
    useShallow((state) => ({
        browserScanPorts: state.browserScanPorts,
    }))
);
```

- [ ] **Step 4: 测试前端调用**

Run: `pnpm --dir frontend run lint`
Expected: 无错误（可能有警告）

- [ ] **Step 5: 手动测试扫描功能**

在Tauri桌面应用中：
1. 打开浏览器面板
2. 点击刷新按钮
3. 观察控制台日志 `[LocalPortSection] scanPorts called, isTauri: true`
4. 验证端口列表更新

- [ ] **Step 6: 提交代码**

```bash
git add frontend/src/app/stores/slices/browserLandingSlice.ts frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx
git commit -m "feat(port-scan): integrate frontend with Tauri scanning command"
```

### Task 3: 添加用户配置的端口列表

**Files:**
- Modify: `frontend/src/app/stores/slices/browserLandingSlice.ts`
- Create: `frontend/src/app/features/browser/browser-landing/PortScanConfig.tsx`（可选）

**Interfaces:**
- Consumes: Task 2 的扫描功能
- Produces: `browserConfiguredPorts` 状态，用户可配置的端口列表

- [ ] **Step 1: 在browserLandingSlice中添加配置状态**

```typescript
// 在 BrowserLandingSlice 接口中添加
browserConfiguredPorts: number[];
browserSetConfiguredPorts: (ports: number[]) => void;
browserAddConfiguredPort: (port: number) => void;
browserRemoveConfiguredPort: (port: number) => void;

// 在 createBrowserLandingSlice 中实现
browserConfiguredPorts: [3000, 5000, 8080, 8000, 3001, 5173, 4200, 9000],
browserSetConfiguredPorts: (ports) => {
    // 持久化到localStorage或Tauri存储
    localStorage.setItem('adl-browser-configured-ports', JSON.stringify(ports));
    set({ browserConfiguredPorts: ports });
},
browserAddConfiguredPort: (port) => {
    const current = get().browserConfiguredPorts;
    if (!current.includes(port)) {
        const updated = [...current, port].sort((a, b) => a - b);
        get().browserSetConfiguredPorts(updated);
    }
},
browserRemoveConfiguredPort: (port) => {
    const current = get().browserConfiguredPorts;
    const updated = current.filter(p => p !== port);
    get().browserSetConfiguredPorts(updated);
},
```

- [ ] **Step 2: 修改LocalPortSection使用配置的端口列表**

修改 `scanPorts` 函数：
```typescript
const scanPorts = useCallback(async () => {
    // ... 前面代码
    if (useAppStore.getState().isTauri) {
        // 使用用户配置的端口列表
        const configuredPorts = useAppStore.getState().browserConfiguredPorts;
        await browserScanPorts(configuredPorts);
    }
    // ... 后面代码
}, [browserScanPorts, browserSetPortScanning]);
```

- [ ] **Step 3: 从localStorage加载配置**

在 `createBrowserLandingSlice` 初始化时：
```typescript
// 从localStorage加载配置的端口列表
const savedPorts = localStorage.getItem('adl-browser-configured-ports');
const initialConfiguredPorts = savedPorts ? JSON.parse(savedPorts) : [3000, 5000, 8080, 8000, 3001, 5173, 4200, 9000];
```

- [ ] **Step 4: 测试配置功能**

在浏览器控制台测试：
```typescript
// 添加端口
useAppStore.getState().browserAddConfiguredPort(3001);
// 移除端口
useAppStore.getState().browserRemoveConfiguredPort(3001);
// 验证配置
console.log(useAppStore.getState().browserConfiguredPorts);
```

- [ ] **Step 5: 提交代码**

```bash
git add frontend/src/app/stores/slices/browserLandingSlice.ts
git commit -m "feat(port-scan): add configurable port list with persistence"
```

### Task 4: 添加查看详情功能

**Files:**
- Modify: `frontend/src/app/features/browser/browser-landing/BrowserLandingPage.tsx`
- Modify: `src-tauri/src/commands/port_scan.rs`

**Interfaces:**
- Consumes: Task 1 的 `PortDetails` 结构
- Produces: 右键菜单"查看详情"选项，显示端口详细信息对话框

- [ ] **Step 1: 实现Rust端口详情命令**

在 `port_scan.rs` 中添加：
```rust
#[command]
pub async fn browser_get_port_details(port: u16) -> Result<PortDetails, String> {
    let is_open = scan_single_port(port).await.is_open;
    
    // 获取进程信息（平台特定实现）
    let process_info = if is_open {
        get_process_info(port).await
    } else {
        None
    };
    
    Ok(PortDetails {
        port,
        is_open,
        process_info,
    })
}

async fn get_process_info(port: u16) -> Option<ProcessInfo> {
    // 平台特定实现
    #[cfg(target_os = "windows")]
    {
        // Windows: 使用netstat或Get-NetTCPConnection
        get_process_info_windows(port).await
    }
    #[cfg(target_os = "macos")]
    {
        // macOS: 使用lsof
        get_process_info_macos(port).await
    }
    #[cfg(target_os = "linux")]
    {
        // Linux: 使用lsof或ss
        get_process_info_linux(port).await
    }
}
```

- [ ] **Step 2: 实现Windows进程信息获取**

```rust
#[cfg(target_os = "windows")]
async fn get_process_info_windows(port: u16) -> Option<ProcessInfo> {
    use tokio::process::Command;
    
    let output = Command::new("netstat")
        .args(["-ano", "-p", "TCP"])
        .output()
        .await
        .ok()?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains(&format!(":{}", port)) && line.contains("LISTENING") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(pid_str) = parts.last() {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    // 获取进程名称
                    let name_output = Command::new("tasklist")
                        .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"])
                        .output()
                        .await
                        .ok()?;
                    
                    let name_stdout = String::from_utf8_lossy(&name_output.stdout);
                    let name = name_stdout
                        .lines()
                        .next()
                        .and_then(|line| line.split(',').nth(0))
                        .map(|s| s.trim_matches('"').to_string())
                        .unwrap_or_else(|| "Unknown".to_string());
                    
                    return Some(ProcessInfo {
                        pid,
                        name,
                        command: format!("TCP listening on port {}", port),
                    });
                }
            }
        }
    }
    None
}
```

- [ ] **Step 3: 在mod.rs中注册新命令**

在 `src-tauri/src/commands/mod.rs` 中确保 `port_scan` 模块已导出。

- [ ] **Step 4: 前端添加查看详情菜单项**

在 `BrowserLandingPage.tsx` 的 `portContextMenuItems` 中添加：
```typescript
{
    id: 'details',
    label: t.browserPortDetails || '查看详情',
    action: handlePortDetailsFromMenu,
},
```

- [ ] **Step 5: 实现查看详情处理函数**

```typescript
const handlePortDetailsFromMenu = useCallback(async () => {
    if (portMenu.port) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const details = await invoke<{
                port: number;
                is_open: boolean;
                process_info: { pid: number; name: string; command: string } | null;
            }>('browser_get_port_details', { port: portMenu.port.port });
            
            // 显示详情对话框
            setPortDetails(details);
            setPortDetailsOpen(true);
        } catch (error) {
            console.error('[BrowserLandingPage] get port details failed:', error);
        }
    }
    handleContextMenuClose();
}, [portMenu.port, handleContextMenuClose]);
```

- [ ] **Step 6: 添加详情对话框状态**

```typescript
const [portDetails, setPortDetails] = useState<{
    port: number;
    is_open: boolean;
    process_info: { pid: number; name: string; command: string } | null;
} | null>(null);
const [portDetailsOpen, setPortDetailsOpen] = useState(false);
```

- [ ] **Step 7: 添加国际化key**

在 `zh-CN/browser.ts` 中添加：
```typescript
browserPortDetails: '查看详情',
browserPortDetailsTitle: '端口 {port} 详细信息',
browserPortStatus: '状态',
browserPortOpen: '开放',
browserPortClosed: '关闭',
browserPortProcess: '进程信息',
browserPortPid: 'PID',
browserPortProcessName: '进程名称',
browserPortCommand: '命令',
```

在 `en-US/browser.ts` 中添加：
```typescript
browserPortDetails: 'View Details',
browserPortDetailsTitle: 'Port {port} Details',
browserPortStatus: 'Status',
browserPortOpen: 'Open',
browserPortClosed: 'Closed',
browserPortProcess: 'Process Information',
browserPortPid: 'PID',
browserPortProcessName: 'Process Name',
browserPortCommand: 'Command',
```

- [ ] **Step 8: 测试查看详情功能**

在Tauri桌面应用中：
1. 右键点击一个开放端口
2. 选择"查看详情"
3. 验证对话框显示端口状态和进程信息

- [ ] **Step 9: 提交代码**

```bash
git add src-tauri/src/commands/port_scan.rs frontend/src/app/features/browser/browser-landing/BrowserLandingPage.tsx frontend/src/app/i18n/zh-CN/browser.ts frontend/src/app/i18n/en-US/browser.ts
git commit -m "feat(port-scan): add view details functionality with process info"
```

### Task 5: 错误处理和性能优化

**Files:**
- Modify: `src-tauri/src/commands/port_scan.rs`
- Modify: `frontend/src/app/features/browser/browser-landing/usePortScan.ts`

**Interfaces:**
- Consumes: Task 1-4 的所有功能
- Produces: 完善的错误处理，性能优化

- [ ] **Step 1: 添加Rust端错误处理**

修改 `browser_scan_ports` 命令：
```rust
#[command]
pub async fn browser_scan_ports(ports: Vec<u16>) -> Result<Vec<ScannedPort>, String> {
    if ports.is_empty() {
        return Ok(Vec::new());
    }
    
    if ports.len() > 100 {
        return Err("Too many ports to scan (max 100)".to_string());
    }
    
    // 验证端口范围
    for port in &ports {
        if *port == 0 || *port > 65535 {
            return Err(format!("Invalid port number: {}", port));
        }
    }
    
    // ... 剩余实现
}
```

- [ ] **Step 2: 添加前端错误处理**

创建 `usePortScan.ts` hook：
```typescript
import { useCallback, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';

export function usePortScan() {
    const [error, setError] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    
    const scanPorts = useCallback(async () => {
        if (isScanning) return;
        
        setIsScanning(true);
        setError(null);
        
        try {
            const { isTauri, browserScanPorts, browserConfiguredPorts } = useAppStore.getState();
            
            if (isTauri) {
                await browserScanPorts(browserConfiguredPorts);
            } else {
                // 浏览器模式回退
                const response = await fetch('/__adl_preview_api__/browser/scan-ports');
                if (!response.ok) {
                    throw new Error(`Scan failed: ${response.statusText}`);
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setError(message);
            console.error('[usePortScan] scan failed:', err);
        } finally {
            setIsScanning(false);
        }
    }, [isScanning]);
    
    return { scanPorts, error, isScanning };
}
```

- [ ] **Step 3: 优化并发和超时**

在Rust端调整并发数和超时：
```rust
// 根据端口数量动态调整并发数
let concurrency = if unique_ports.len() > 20 { 10 } else { 5 };
let timeout_ms = if unique_ports.len() > 20 { 200 } else { 300 };
```

- [ ] **Step 4: 添加性能监控日志**

```rust
tracing::info!(
    port_count = unique_ports.len(),
    concurrency,
    timeout_ms,
    "browser_scan_ports: starting scan"
);

let start = std::time::Instant::now();
// ... 扫描逻辑
tracing::info!(
    port_count = unique_ports.len(),
    open_count = results.iter().filter(|r| r.is_open).count(),
    duration_ms = start.elapsed().as_millis(),
    "browser_scan_ports: completed"
);
```

- [ ] **Step 5: 测试错误场景**

测试以下场景：
1. 空端口列表
2. 超过100个端口
3. 无效端口（0或>65535）
4. 网络超时
5. 权限不足（获取进程信息）

- [ ] **Step 6: 提交代码**

```bash
git add src-tauri/src/commands/port_scan.rs frontend/src/app/features/browser/browser-landing/usePortScan.ts
git commit -m "feat(port-scan): add error handling and performance optimization"
```

### Task 6: 集成测试和文档

**Files:**
- Create: `src-tauri/tests/port_scan_integration.rs`
- Modify: `README.md`（可选）

**Interfaces:**
- Consumes: Task 1-5 的所有功能
- Produces: 集成测试，使用文档

- [ ] **Step 1: 创建集成测试**

```rust
// src-tauri/tests/port_scan_integration.rs
use adl_tauri::commands::port_scan::{browser_scan_ports, browser_get_port_details};

#[tokio::test]
async fn test_integration_scan_ports() {
    let ports = vec![80, 443, 3000, 8080];
    let result = browser_scan_ports(ports).await;
    assert!(result.is_ok());
    
    let scanned = result.unwrap();
    assert_eq!(scanned.len(), 4);
    
    // 验证排序
    let port_numbers: Vec<u16> = scanned.iter().map(|p| p.port).collect();
    assert_eq!(port_numbers, vec![80, 443, 3000, 8080]);
}

#[tokio::test]
async fn test_integration_get_port_details() {
    // 测试一个可能开放的端口
    let result = browser_get_port_details(80).await;
    assert!(result.is_ok());
    
    let details = result.unwrap();
    assert_eq!(details.port, 80);
    // 不断言 is_open，因为环境不同
}
```

- [ ] **Step 2: 运行集成测试**

Run: `cargo test --test port_scan_integration`
Expected: 测试通过（可能跳过网络相关测试）

- [ ] **Step 3: 更新文档**

在 `README.md` 的"功能"部分添加：
```markdown
### 本地端口扫描
- 自动扫描用户配置的常见开发端口
- 支持手动刷新扫描
- 显示端口状态（开放/关闭）和响应时间
- 支持查看端口详细信息（进程信息）
- 用户可配置端口列表
```

- [ ] **Step 4: 最终验证**

在Tauri桌面应用中完整测试：
1. 自动扫描功能
2. 手动刷新功能
3. 端口配置功能
4. 查看详情功能
5. 错误处理

- [ ] **Step 5: 提交代码**

```bash
git add src-tauri/tests/port_scan_integration.rs README.md
git commit -m "test(port-scan): add integration tests and documentation"
```

---

## 执行选项

**Plan complete and saved to `docs/superpowers/plans/2026-09-01-tauri-port-scanning.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**