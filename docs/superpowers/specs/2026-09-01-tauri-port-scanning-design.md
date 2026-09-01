# Tauri 端口扫描功能设计文档

## 概述

为浏览器面板的"本地端口"功能添加Tauri桌面应用下的端口扫描支持。当前`scanPorts`函数在Tauri模式下为空操作，需要实现实际的端口扫描功能。

### 目标
1. 自动扫描用户配置的常见开发端口
2. 支持手动刷新扫描
3. 显示端口状态（开放/关闭）
4. 支持查看端口详细信息（进程信息）

### 非目标
- 不扫描所有端口（0-65535），只扫描用户配置的常见开发端口
- 不实现实时监控（后续可扩展）
- 不涉及网络扫描（仅本地端口）

## 架构设计

采用Tauri IPC架构，前后端分离：

```
前端 (TypeScript) → Tauri IPC → 后端 (Rust) → TCP连接测试 → 返回结果
```

### 关键组件
1. **前端层**：`LocalPortSection.tsx`调用`scanPorts`
2. **桥接层**：Tauri IPC传递端口列表
3. **后端层**：Rust实现`browser_scan_ports`命令
4. **存储层**：`browserLandingSlice`管理端口状态

## 组件设计

### Rust后端组件

**新建文件**：`src-tauri/src/commands/port_scan.rs`

**命令**：
1. `browser_scan_ports(ports: Vec<u16>) -> Result<Vec<ScannedPort>, String>`
   - 并发TCP连接测试端口
   - 返回端口状态和响应时间
   
2. `browser_get_port_details(port: u16) -> Result<PortDetails, String>`
   - 获取端口详细信息（进程信息）
   - 需要系统权限

**数据模型**：
```rust
struct ScannedPort {
    port: u16,
    is_open: bool,
    response_time_ms: Option<u64>,
}

struct PortDetails {
    port: u16,
    is_open: bool,
    process_info: Option<ProcessInfo>,
}

struct ProcessInfo {
    pid: u32,
    name: String,
    command: String,
}
```

### 前端组件

**修改文件**：
1. `LocalPortSection.tsx`：移除浏览器模式下的fetch扫描，统一调用Tauri command
2. `browserLandingSlice.ts`：添加`browserScanPorts` action
3. 新增`usePortScan` hook：封装端口扫描逻辑

**数据模型**：
```typescript
interface LocalPort {
    id: string;
    host: string;
    port: number;
    label?: string;
    isAutoDiscovered: boolean;
    lastAliveAt: number;
    sortOrder: number;
    // 新增字段
    is_open?: boolean;
    response_time_ms?: number;
}
```

### 配置管理

在设置中添加"端口扫描"配置项：
- 默认端口列表：3000, 5000, 8080, 8000, 3001, 5173, 4200, 9000
- 用户可添加/删除/修改端口
- 使用Tauri持久化存储

## 数据流

### 自动扫描流程
1. 组件挂载 → `useEffect`触发 `scanPorts()`
2. `scanPorts`调用`invoke('browser_scan_ports', { ports: configuredPorts })`
3. 后端并发TCP连接测试 → 返回`ScannedPort[]`
4. 前端更新`browserLocalPorts` store
5. UI重新渲染端口列表

### 手动刷新流程
1. 用户点击RefreshButton → `handleRefresh()`
2. 调用`scanPorts()` → 同上流程

### 查看详情流程
1. 用户右键端口 → 选择"查看详情"
2. 调用`invoke('browser_get_port_details', { port })`
3. 后端获取进程信息 → 返回`PortDetails`
4. 前端显示详情对话框

## 错误处理

1. **网络错误**：Tauri command调用失败 → 显示错误提示，保持现有列表
2. **超时错误**：扫描超时 → 返回部分结果，标记超时端口
3. **权限错误**：无权限获取进程信息 → 详情命令返回错误，UI提示
4. **配置错误**：无效端口列表 → 使用默认列表，记录警告

## 性能要求

- 扫描超时：每个端口300ms
- 并发数：10个并发连接
- 总时间：<2s（30个端口）
- 内存使用：<10MB

## 测试策略

### 单元测试
- Rust端口扫描函数测试
- 前端hook测试

### 集成测试
- Tauri command调用测试
- 前后端交互测试

### E2E测试
- 完整扫描流程测试
- 错误场景测试

## 实现步骤

### 阶段1：基础功能
1. 创建Rust端口扫描命令
2. 实现基本TCP连接测试
3. 前端调用命令并显示结果

### 阶段2：配置管理
1. 添加端口配置UI
2. 实现配置持久化
3. 支持用户自定义端口列表

### 阶段3：增强功能
1. 添加进程信息获取
2. 实现详情对话框
3. 优化性能和错误处理

## 风险与注意事项

1. **跨平台兼容性**：Windows、macOS、Linux的进程信息获取方式不同
2. **权限问题**：获取进程信息可能需要管理员权限
3. **性能影响**：大量端口扫描可能影响系统性能
4. **安全考虑**：防止恶意端口列表导致的安全问题

## 参考资料

1. Zynlex项目端口扫描实现：`src-tauri/src/commands/ports.rs`
2. tauri-plugin-network插件
3. port-manager项目的平台特定实现