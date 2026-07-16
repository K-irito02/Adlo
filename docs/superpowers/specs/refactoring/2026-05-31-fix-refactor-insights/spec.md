# 重构洞察修复 - Product Requirement Document

## Overview
- **Summary**: 修复 2026-05-31 重构洞察报告中发现的架构和性能问题，包括清理 deprecated 代码、统一工具函数、优化性能等
- **Purpose**: 保持代码库整洁、减少技术债务、提高性能
- **Target Users**: 开发团队维护者

## Goals
- 清理 ui-store.ts 中所有 @deprecated 的终端相关代码
- 统一 localStorage 工具函数到共享模块
- 优化 MessageStream 组件的虚拟滚动性能
- 完善浏览器功能状态管理统一
- 优化终端 localStorage 批处理
- 添加 Rust 后端文件缓存

## Non-Goals (Out of Scope)
- 不重构整个状态管理架构（Zustand 切片模式保持不变
- 不进行大的 UI/UX 变更
- 不添加新功能特性

## Background & Context
- 项目已完成多轮重构，终端功能已迁移至 terminalSlice
- ui-store.ts 仍保留旧代码造成代码库冗余
- localStorage 工具函数在多个文件中重复实现
- MessageStream 已使用 react-window 但有优化空间

## Functional Requirements
- **FR-1**: 清理 ui-store.ts 中的 @deprecated 终端代码
- **FR-2**: 统一 localStorage 相关工具函数到共享模块
- **FR-3**: 优化 MessageStream 组件的虚拟滚动实现
- **FR-4**: 统一浏览器功能状态管理到 browserSlice
- **FR-5**: 优化终端 localStorage 批处理机制
- **FR-6**: 添加 Rust 后端文件内容缓存

## Non-Functional Requirements
- **NFR-1**: 所有修改保持双端一致性（Tauri + 浏览器模式）
- **NFR-2**: 所有现有测试必须通过
- **NFR-3**: 保持类型安全，无 TypeScript 错误

## Constraints
- **Technical**: React 19 + TypeScript + Rust
- **Business**: 保持现有功能不变
- **Dependencies**: 现有 Zustand 切片架构

## Assumptions
- 所有功能已有足够测试覆盖验证变更

## Acceptance Criteria

### AC-1: Deprecated 代码清理
- **Given**: ui-store.ts 中有 @deprecated TerminalTabState 类型
- **When**: 清理完成
- **Then**: 所有 @deprecated 的终端相关代码被移除
- **Verification**: `programmatic`

### AC-2: 工具函数统一
- **Given**: terminalSlice.ts 和 ui-store.ts 有重复工具函数
- **When**: 重构完成
- **Then**: 所有 localStorage 工具函数提取到共享模块
- **Verification**: `programmatic`

### AC-3: MessageStream 优化
- **Given**: MessageStream 组件使用 react-window
- **When**: 优化完成
- **Then**: 组件渲染性能提升，无不必要重渲染
- **Verification**: `human-judgment` + 性能测试

### AC-4: 浏览器状态统一
- **Given**: 浏览器功能分散在 ui-store 和 browserSlice
- **When**: 迁移完成
- **Then**: 所有浏览器状态和方法统一到 browserSlice
- **Verification**: `programmatic`

### AC-5: localStorage 批处理优化
- **Given**: 终端使用简单 setTimeout 批处理
- **When**: 优化完成
- **Then**: 批量写入更高效，防抖/节流机制工作正常
- **Verification**: `human-judgment`

### AC-6: 测试通过
- **Given**: 所有修改完成
- **When**: 运行测试
- **Then**: 所有测试通过
- **Verification**: `programmatic`

## Open Questions
- [ ] 是否需要保留某些 deprecated 代码的兼容性过渡？
