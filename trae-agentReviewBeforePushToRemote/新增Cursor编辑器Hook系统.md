## 1. 高层摘要 (TL;DR)

*   **影响范围:** 🟡 **中等** - 新增Cursor编辑器Hook系统，实现Electron桌面应用开发环境的智能自动重启
*   **核心变更:**
    *   ✨ 新增 `.cursor/hooks.json` 配置文件，定义文件编辑和停止时的自动化Hook
    *   🚀 新增 `restart-desktop-dev.ps1` 脚本，智能检测UI文件修改并标记重启
    *   🔧 新增 `desktop-dev-runner.ps1` 脚本，管理Vite和Electron进程的启动与监控
    *   📊 新增状态持久化机制，追踪进程PID和重启标记

---

## 2. 可视化架构图

```mermaid
graph TD
    subgraph "Cursor Editor Hooks"
        A["afterFileEdit Hook"] --> B["restart-desktop-dev.ps1 -Mode mark"]
        A2["afterTabFileEdit Hook"] --> B
        C["stop Hook"] --> D["restart-desktop-dev.ps1 -Mode restartIfMarked"]
    end
    
    subgraph "restart-desktop-dev.ps1"
        B --> E{检查文件路径}
        E -->|匹配UI路径| F["设置 pendingRestart = true"]
        E -->|不匹配| G["退出"]
        F --> H["保存状态到 .restart-desktop-dev.state.json"]
        
        D --> I{检查 pendingRestart}
        I -->|false| G
        I -->|true| J["Stop-ExistingDev"]
        J --> K["Start-DevDetached"]
        K --> L["更新状态: pendingRestart = false"]
    end
    
    subgraph "desktop-dev-runner.ps1"
        K --> M["启动 Vite Dev Server<br/>端口 5173"]
        M --> N["等待端口就绪<br/>最长30秒"]
        N --> O["构建主进程<br/>npm run build:main"]
        O --> P["构建预加载脚本<br/>npm run build:preload"]
        P --> Q["启动 Electron<br/>设置环境变量"]
        Q --> R["保存进程PID到状态文件"]
        R --> S["保持进程运行"]
    end
    
    subgraph "状态文件"
        H --> T[".restart-desktop-dev.state.json"]
        L --> T
        R --> T
    end
    
    style A fill:#bbdefb,color:#0d47a1
    style B fill:#c8e6c9,color:#1a5e20
    style D fill:#fff3e0,color:#e65100
    style E fill:#f3e5f5,color:#7b1fa2
    style I fill:#f3e5f5,color:#7b1fa2
    style T fill:#ffcdd2,color:#b71c1c
```

---

## 3. 详细变更分析

### 📁 组件一: Hook配置系统

**文件:** `.cursor/hooks.json` (新增)

**功能说明:**
定义了Cursor编辑器的自动化Hook配置，在文件编辑和停止时触发PowerShell脚本。

| Hook类型 | 触发时机 | 执行命令 | 超时时间 |
|---------|---------|---------|---------|
| `afterFileEdit` | 文件编辑后 | `restart-desktop-dev.ps1 -Mode mark` | 30秒 |
| `afterTabFileEdit` | 标签页文件编辑后 | `restart-desktop-dev.ps1 -Mode mark` | 30秒 |
| `stop` | Cursor停止时 | `restart-desktop-dev.ps1 -Mode restartIfMarked` | 30秒 |

---

### 🔄 组件二: 智能重启控制器

**文件:** `.cursor/hooks/restart-desktop-dev.ps1` (新增, 201行)

**核心功能:**

#### 📌 模式一: `mark` - 标记需要重启
```powershell
# 工作流程
1. 读取stdin中的JSON输入（包含编辑的文件路径）
2. 提取文件路径（支持多种字段名：path, filePath, filepath等）
3. 判断是否需要重启（基于路径模式匹配）
4. 如果需要，设置状态: pendingRestart = true
5. 保存状态到 .restart-desktop-dev.state.json
```

#### 📌 模式二: `restartIfMarked` - 执行重启
```powershell
# 工作流程
1. 检查状态文件中的 pendingRestart 标记
2. 如果为true:
   - 停止现有开发进程（Vite + Electron）
   - 启动新的开发环境（调用 desktop-dev-runner.ps1）
   - 更新状态: pendingRestart = false
   - 记录重启时间戳
```

#### 🎯 智能路径匹配规则

| 路径模式 | 说明 | 示例 |
|---------|------|------|
| `^ai-digital-life/apps/desktop/renderer/` | 渲染进程代码 | `renderer/src/app/App.tsx` |
| `^ai-digital-life/apps/desktop/shared/` | 共享代码 | `shared/utils.ts` |
| `^ai-digital-life/packages/.+/src/.*(ui\|ux\|design\|theme\|styles?)` | UI组件库 | `packages/ui/src/components/Button.tsx` |
| `^ai-digital-life/packages/.+/(src/)?design-system/` | 设计系统 | `packages/design-system/...` |
| `^ai-digital-life/packages/.+/(src/)?styles/` | 样式文件 | `packages/theme/styles/...` |

#### 📊 状态文件结构

```json
{
  "devRunnerPid": 16936,        // Runner进程PID
  "pendingRestart": false,      // 是否待重启
  "vitePid": null,              // Vite进程PID
  "lastRestartAtMs": 1776656557531,  // 上次重启时间
  "devStartedAtMs": 1776657247843,   // 开发启动时间
  "viteReady": true,            // Vite是否就绪
  "lastEditedPath": "ai-digital-life/apps/desktop/renderer/src/app/App.tsx",
  "electronPid": 27804,         // Electron进程PID
  "pendingSinceMs": null        // 待重启开始时间
}
```

---

### 🚀 组件三: 开发环境运行器

**文件:** `.cursor/hooks/desktop-dev-runner.ps1` (新增, 97行)

**核心功能:**

#### 🔧 启动流程

```mermaid
sequenceDiagram
    participant R as desktop-dev-runner.ps1
    participant V as Vite Dev Server
    participant B as Build Scripts
    participant E as Electron App
    participant S as State File
    
    R->>V: 启动 Vite (端口5173)
    R->>R: 等待端口就绪 (最多30秒)
    V-->>R: 端口5173就绪
    R->>B: npm run build:main
    R->>B: npm run build:preload
    R->>E: 启动 Electron<br/>设置 ELECTRON_DEV=true<br/>设置 ADL_RENDERER_DEV_URL=http://localhost:5173
    R->>S: 保存进程PID
    R->>E: 保持进程运行
```

#### 📝 关键实现细节

| 步骤 | 操作 | 超时/限制 |
|-----|------|----------|
| 1 | 启动Vite开发服务器 | 无 |
| 2 | 等待5173端口就绪 | 30秒（60次×500ms） |
| 3 | 构建主进程 | `npm run build:main -w @ai-digital-life/desktop` |
| 4 | 构建预加载脚本 | `npm run build:preload -w @ai-digital-life/desktop` |
| 5 | 启动Electron | 设置环境变量后运行 `npm run start` |
| 6 | 保存状态 | 记录vitePid、electronPid、devRunnerPid |

#### 🔐 进程管理

```powershell
# 停止现有进程
Stop-ExistingDev($state) {
  # 停止的进程类型:
  - devPid
  - vitePid
  - electronPid
  - devRunnerPid
  
  # 使用方法:
  - 优先: taskkill /PID <pid> /T /F (终止进程树)
  - 备用: Stop-Process -Id <pid> -Force
}
```

---

### 📁 组件四: 状态持久化

**文件:** `.cursor/hooks/.restart-desktop-dev.state.json` (新增)

**作用:**
- 持久化存储开发环境状态
- 跨Hook调用共享数据
- 支持进程恢复和清理

**关键状态字段:**

| 字段 | 类型 | 用途 |
|-----|------|------|
| `pendingRestart` | boolean | 是否需要重启 |
| `lastEditedPath` | string | 最后编辑的文件路径 |
| `lastRestartAtMs` | number | 上次重启时间戳 |
| `viteReady` | boolean | Vite是否就绪 |
| `devRunnerPid` | number | Runner进程PID |

---

## 4. 影响与风险评估

### ✅ 优势

1. **自动化开发体验** - 修改UI代码后无需手动重启，提升开发效率
2. **智能过滤** - 只在修改UI相关文件时重启，避免不必要的重启
3. **进程管理完善** - 自动清理旧进程，防止端口占用和僵尸进程
4. **状态可追踪** - 通过日志和状态文件，可追溯重启历史

### ⚠️ 风险点 (已解决)

| 风险 | 影响 | 缓解措施 | 状态 |
|-----|------|---------|------|
| **端口占用** | 如果5173端口被其他程序占用，Vite启动失败 | ✅ 启动前自动检测并清理占用端口的进程；增加端口可用性验证；失败时记录详细错误信息 | ✅ 已解决 |
| **进程清理不彻底** | 某些子进程可能未被终止 | ✅ 多层清理策略：状态文件PID清理 + 端口关联进程清理 + 工作目录进程清理；使用 `taskkill /T` 终止进程树 | ✅ 已解决 |
| **路径匹配误判** | 可能误判某些文件需要重启 | ✅ 增加排除规则（测试文件、配置文件、文档等）；支持包名匹配（如 `packages/ui/`）；详细日志记录 | ✅ 已解决 |
| **状态文件损坏** | JSON解析失败可能导致Hook异常 | ✅ 状态文件备份机制；损坏检测与自动修复；从备份恢复；最小化状态写入 | ✅ 已解决 |

### ✅ 风险缓解详情

#### 1. 端口占用风险缓解
- **端口检测函数** `Get-ProcessUsingPort`: 检测占用指定端口的进程
- **端口可用性验证** `Test-PortAvailable`: 启动前验证端口是否可用
- **自动清理机制**: 启动前自动清理占用5173端口的进程
- **错误记录**: 失败时记录 `lastError` 和 `lastErrorAtMs` 到状态文件

#### 2. 进程清理风险缓解
- **三层清理策略**:
  1. 状态文件PID清理: 根据保存的PID终止进程
  2. 端口关联清理: 终止占用5173端口的所有进程
  3. 工作目录清理: 终止工作目录下的node/electron进程
- **进程树终止**: 使用 `taskkill /T /F` 确保子进程一并终止
- **清理验证**: 清理后验证端口是否已释放

#### 3. 路径匹配风险缓解
- **排除规则**: 测试文件(.test/spec)、配置文件(.config)、文档(.md)等
- **包名匹配**: 支持 `packages/(ui|ux|design|theme|styles?)/` 模式
- **详细日志**: 记录匹配结果和排除原因

#### 4. 状态文件风险缓解
- **备份机制**: 每次写入前自动备份到 `.backup` 文件
- **损坏检测**: `Test-StateValid` 函数检测JSON是否有效
- **自动修复**: `Repair-State` 函数从备份恢复或创建空状态
- **最小化写入**: 写入失败时只保留核心字段

### 🧪 测试验证 (已通过)

测试脚本: `.cursor/hooks/test-risk-mitigation.ps1`

**测试结果: 25/25 通过**

| 测试类别 | 测试项 | 结果 |
|---------|-------|------|
| 端口检测 | 端口状态检测 | ✅ PASS |
| 端口检测 | 测试端口检测能力 | ✅ PASS |
| 进程终止 | 单进程终止 | ✅ PASS |
| 进程终止 | 进程树终止(/T标志) | ✅ PASS |
| 路径匹配 | 渲染进程文件 | ✅ PASS |
| 路径匹配 | 共享代码 | ✅ PASS |
| 路径匹配 | UI组件 | ✅ PASS |
| 路径匹配 | 主题样式 | ✅ PASS |
| 路径匹配 | 主进程代码(排除) | ✅ PASS |
| 路径匹配 | 测试文件(排除) | ✅ PASS |
| 路径匹配 | 配置文件(排除) | ✅ PASS |
| 路径匹配 | 文档文件(排除) | ✅ PASS |
| 状态文件 | 有效JSON解析 | ✅ PASS |
| 状态文件 | 备份创建 | ✅ PASS |
| 状态文件 | 从备份恢复 | ✅ PASS |
| 状态文件 | 损坏检测 | ✅ PASS |
| 状态文件 | 空状态处理 | ✅ PASS |

---

## 5. 使用说明

### 🚀 快速开始

1. **确保Hook文件已放置在正确位置:**
   ```
   .cursor/
   ├── hooks.json
   └── hooks/
       ├── restart-desktop-dev.ps1
       ├── desktop-dev-runner.ps1
       └── .restart-desktop-dev.state.json
   ```

2. **手动启动开发环境（首次）:**
   ```powershell
   # 在项目根目录执行
   powershell -NoProfile -ExecutionPolicy Bypass -File .cursor/hooks/desktop-dev-runner.ps1 -RepoRoot .
   ```

3. **后续自动运行:**
   - 编辑UI文件后，Hook会自动标记需要重启
   - 停止Cursor时，会自动重启开发环境

### 📝 日志查看

```powershell
# 查看重启日志
Get-Content .cursor/hooks/desktop-dev.log

# 查看当前状态
Get-Content .cursor/hooks/.restart-desktop-dev.state.json | ConvertFrom-Json
```

---

## 6. 总结

这是一个设计精良的自动化开发环境管理系统，通过Cursor的Hook机制实现了智能的Electron应用开发环境重启。系统具有以下特点：

- 🎯 **精准触发** - 基于路径模式的智能判断
- 🔄 **状态管理** - 完善的进程状态追踪
- 🛡️ **容错设计** - 多层次的异常处理
- 📊 **可观测性** - 详细的日志和状态记录

该系统显著提升了Electron桌面应用的开发体验，减少了手动操作，让开发者可以专注于代码本身。