# 三种终端类型全面测试与修复计划

## 1. 概述

本计划对项目右侧面板的三种终端类型（PowerShell、CMD、Bash）进行全面测试，识别并修复潜在问题。

## 2. 测试范围

### 2.1 终端类型
- ✅ PowerShell
- ✅ CMD
- ✅ Bash

### 2.2 运行环境
- ✅ Tauri 桌面应用模式
- ✅ 浏览器预览模式

### 2.3 测试维度
1. **创建与启动**
2. **基本命令执行**
3. **输入输出流**
4. **窗口大小调整**
5. **多会话管理**
6. **错误处理**
7. **双端一致性**

## 3. 代码审查发现的问题

### 3.1 Bash 终端的潜在问题

**问题 1：Windows 上的 Bash 解析**
- **位置**：`crates/terminal/src/shell_resolver.rs` 第 92-99 行
- **描述**：Bash 的候选路径包括 Git Bash 和 WSL，但默认 fallback 是 "bash.exe"，Windows 上可能不存在
- **风险**：创建 Bash 终端时可能失败

**问题 2：浏览器模式的 Bash 参数**
- **位置**：`frontend/dev/previewTerminalService.ts` 第 62 行
- **描述**：WSL 的 Bash 没有正确的参数
- **风险**：WSL 模式可能无法正常工作

### 3.2 Shell 解析器不一致

**问题 3：双端 Shell 解析逻辑不统一**
- **Rust 端**：`crates/terminal/src/shell_resolver.rs`
- **前端预览端**：`frontend/dev/previewTerminalService.ts`
- **描述**：两者的 Shell 解析逻辑有细微差异，可能导致双端行为不一致

### 3.3 错误处理不完善

**问题 4：终端启动失败时的用户提示**
- **位置**：`frontend/src/app/features/terminal/useTerminalPanel.ts` 第 174-184 行
- **描述**：当 Shell 启动失败时，仅设置状态为 terminated，但没有详细的错误信息展示给用户

### 3.4 浏览器模式的 SSE 连接

**问题 5：SSE 连接稳定性**
- **位置**：`frontend/dev/previewTerminalService.ts`
- **描述**：已有一些稳定措施，但可能仍有改进空间

## 4. 修复计划

### 4.1 Phase 1：Shell 解析器统一与增强

#### 4.1.1 改进 Rust 端 Shell 解析器
**文件**：`crates/terminal/src/shell_resolver.rs`
- 改进 Shell 不存在时的错误信息
- 添加 Shell 可用性预检查
- 优化 WSL 检测逻辑

#### 4.1.2 改进浏览器端 Shell 解析器
**文件**：`frontend/dev/previewTerminalService.ts`
- 统一 Shell 解析逻辑与 Rust 端保持一致
- 改进错误处理
- 添加更详细的诊断信息

### 4.2 Phase 2：错误处理与用户体验

#### 4.2.1 改进终端启动失败处理
**文件**：`frontend/src/app/features/terminal/useTerminalPanel.ts`
- 捕获并展示更详细的错误信息
- 提供 Shell 不可用时的恢复建议
- 改进空状态 UI

#### 4.2.2 增强终端错误提示
**文件**：`frontend/src/app/features/terminal/TerminalPanel.tsx`
- 优化终端终止时的提示信息
- 提供 Shell 安装/恢复指南链接

### 4.3 Phase 3：测试验证

#### 4.3.1 单元测试
- Rust 端 Shell 解析器测试
- 前端状态管理测试

#### 4.3.2 集成测试
- 双端终端功能一致性测试
- 三种 Shell 类型的完整流程测试

## 5. 详细修复任务清单

### 任务 1：改进 Rust Shell 解析器
**优先级**：高
**文件**：`crates/terminal/src/shell_resolver.rs`

**修改内容**：
1. 改进 `ShellNotFound::unknown()` 方法的错误信息
2. 添加 Shell 存在性验证辅助函数
3. 优化 WSL 检测逻辑

### 任务 2：统一浏览器端 Shell 解析
**优先级**：高
**文件**：`frontend/dev/previewTerminalService.ts`

**修改内容**：
1. 统一 Shell 解析逻辑与 Rust 端一致
2. 改进 WSL 参数处理
3. 添加更详细的错误诊断

### 任务 3：改进前端错误处理
**优先级**：高
**文件**：`frontend/src/app/features/terminal/useTerminalPanel.ts`

**修改内容**：
1. 改进 `handleCreateTab` 函数的错误处理
2. 捕获并传递详细的错误信息
3. 添加 Shell 可用性检查

### 任务 4：增强用户界面提示
**优先级**：中
**文件**：`frontend/src/app/features/terminal/TerminalPanel.tsx`
**文件**：`frontend/src/app/features/terminal/TerminalEmptyState.tsx`

**修改内容**：
1. 优化终端错误提示 UI
2. 提供 Shell 恢复指南
3. 改进空状态体验

### 任务 5：添加测试
**优先级**：中
**文件**：相关测试文件

**修改内容**：
1. 添加 Shell 解析器单元测试
2. 添加终端启动流程测试

## 6. 验证清单

- [ ] PowerShell 在 Tauri 模式下正常工作
- [ ] PowerShell 在浏览器模式下正常工作
- [ ] CMD 在 Tauri 模式下正常工作
- [ ] CMD 在浏览器模式下正常工作
- [ ] Bash（Git Bash）在 Tauri 模式下正常工作
- [ ] Bash（Git Bash）在浏览器模式下正常工作
- [ ] Bash（WSL）在 Tauri 模式下正常工作
- [ ] Bash（WSL）在浏览器模式下正常工作
- [ ] 终端启动失败时有友好的错误提示
- [ ] 双端功能一致性验证
- [ ] 所有现有测试通过
