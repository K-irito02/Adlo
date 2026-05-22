# 终端功能审查与改进计划

## 一、当前实现分析

### 1.1 架构概览
项目终端功能采用双端实现，同时支持：
- **Tauri 桌面模式**：使用 Rust 的 `portable-pty` 库
- **浏览器模式**：使用 Node.js 的 `node-pty` 库 + SSE 通信

### 1.2 核心组件
| 文件路径 | 职责 |
|---------|------|
| `frontend/src/app/features/terminal/TerminalPanel.tsx` | 终端面板 UI，多标签管理 |
| `frontend/src/app/components/terminal/XtermTerminal.tsx` | xterm.js 封装组件 |
| `frontend/src/app/ui-store.ts` | 终端状态管理（非切片模式） |
| `crates/terminal/src/lib.rs` | Rust 终端库 |
| `crates/terminal/src/session_manager.rs` | 会话管理器 |
| `frontend/src/preview-bridge/ptyBridge.ts` | 浏览器模式 PTY 桥接 |
| `frontend/dev/previewTerminalService.ts` | 浏览器模式终端服务 |

### 1.3 发现的问题

#### 问题 1：状态管理架构不一致 ⚠️
- **现状**：终端状态在独立的 `ui-store.ts` 中管理，而其他功能已迁移到 Zustand 切片模式
- **影响**：代码架构不统一，难以维护
- **建议**：创建 `terminalSlice.ts`，统一使用切片模式

#### 问题 2：缺少错误处理和状态同步
- **现状**：PTY 会话和标签页状态没有良好的同步机制
- **问题**：会话意外终止时 UI 可能没有正确更新

#### 问题 3：浏览器模式中进程清理不完整
- **现状**：`previewTerminalService.ts` 中进程退出后清理可能不完整
- **风险**：可能存在孤儿进程

#### 问题 4：终端历史功能缺失
- **现状**：`TerminalPanel.tsx` 中有历史功能 UI，但功能未完全实现
- **影响**：用户无法查看之前执行的命令历史

## 二、改进方案

### 阶段 1：状态管理重构
1. 创建 `terminalSlice.ts`，将终端状态从 `ui-store.ts` 中迁移出来
2. 更新相关组件引用
3. 保持向后兼容性

### 阶段 2：错误处理和健壮性改进
1. 增加 PTY 会话状态监听
2. 改进错误恢复机制
3. 添加会话超时清理

### 阶段 3：双端一致性验证
1. 测试 Tauri 模式和浏览器模式功能一致性
2. 确保 Shell 解析逻辑一致
3. 统一错误处理

## 三、文件修改清单

| 操作 | 文件 | 描述 |
|------|------|------|
| 新建 | `frontend/src/app/stores/slices/terminalSlice.ts` | 终端状态切片 |
| 修改 | `frontend/src/app/stores/StoreState.ts` | 添加终端 slice 类型 |
| 修改 | `frontend/src/app/stores/slices.ts` | 导出终端 slice |
| 修改 | `frontend/src/app/stores/slicedStore.ts` | 合并终端 slice |
| 修改 | `frontend/src/app/features/terminal/TerminalPanel.tsx` | 更新状态引用 |
| 修改 | `frontend/src/app/ui-store.ts` | 移除终端相关代码（或保持兼容） |
| 检查 | `frontend/dev/previewTerminalService.ts` | 验证进程清理逻辑 |
| 检查 | `crates/terminal/src/session_manager.rs` | 验证会话管理逻辑 |

## 四、验收标准

- [ ] 终端功能在 Tauri 和浏览器模式下都正常工作
- [ ] 状态管理统一使用切片模式
- [ ] 多标签页创建、切换、关闭功能正常
- [ ] 进程意外终止时 UI 正确更新
- [ ] 无类型错误，编译通过
