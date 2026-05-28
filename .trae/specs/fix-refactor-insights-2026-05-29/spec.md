# 重构洞察问题修复 - Product Requirement Document

## Overview
- **Summary**: 系统性地修复重构洞察报告中发现的架构设计和性能优化问题，提升代码质量和系统性能
- **Purpose**: 解决架构设计中的耦合问题，优化性能瓶颈，提高代码可维护性和用户体验
- **Target Users**: 开发团队和最终用户

## Goals
- 🔴 高优先级：修复 MessageStream 虚拟滚动问题，提升大量消息时的性能
- 🟡 中优先级：优化 App 组件架构，拆分业务逻辑到自定义 Hook
- 🟡 中优先级：优化运行活动列表管理和文件内容缓存
- 🟡 中优先级：优化 RightPanel 组件的 re-render 性能
- 🟢 低优先级：改进命令处理、消息块组件等扩展性问题
- 🟢 低优先级：优化 Rust crate 职责划分和其他小改进

## Non-Goals (Out of Scope)
- 不引入新功能
- 不改变现有用户交互流程
- 不重构整个应用架构（只针对具体问题点）
- 不修改数据库结构
- 不引入新的第三方依赖（除性能优化必需的 react-window）

## Background & Context
- 基于 2026-05-29 重构洞察报告
- 项目已经历多轮重构，架构整体良好，但仍有可优化空间
- MessageStream 是用户高频使用的组件，大量消息时性能问题明显
- 其他问题主要是代码质量和架构优化，不影响核心功能

## Functional Requirements
- **FR-1**: MessageStream 组件实现虚拟滚动，只渲染可见区域的消息
- **FR-2**: App 组件业务逻辑拆分为自定义 Hook
- **FR-3**: 运行活动列表实现分页或数据归档
- **FR-4**: RightPanel 组件 props 使用 useMemo/useCallback 优化
- **FR-5**: 命令处理实现注册表模式（可选）
- **FR-6**: MessageBlocks 组件使用工厂模式（可选）

## Non-Functional Requirements
- **NFR-1**: MessageStream 在 1000+ 消息时仍保持 60fps 流畅滚动
- **NFR-2**: App 组件初次渲染时间减少 30%
- **NFR-3**: RightPanel 切换工具时无明显延迟
- **NFR-4**: 所有现有测试通过
- **NFR-5**: 代码变更不引入新的 TypeScript 类型错误

## Constraints
- **Technical**: React 19、Zustand、Rust 现有架构保持不变
- **Business**: 不影响现有功能正常使用
- **Dependencies**: 可引入 react-window 用于虚拟滚动

## Assumptions
- react-window 与现有 React 19 兼容
- 虚拟滚动实现不破坏现有消息气泡样式和交互
- 性能优化不引入可感知的行为变化

## Acceptance Criteria

### AC-1: MessageStream 虚拟滚动实现
- **Given**: 用户有超过 100 条消息的会话
- **When**: 用户滚动消息列表
- **Then**: 只渲染可见区域约 20-30 条消息，滚动流畅无卡顿
- **Verification**: `programmatic` + `human-judgment`
- **Notes**: 使用 React DevTools 验证渲染的 DOM 元素数量

### AC-2: App 组件逻辑拆分
- **Given**: App.tsx 组件
- **When**: 查看代码结构
- **Then**: 业务逻辑（补丁审查、编辑器展示、主题同步）已拆分到自定义 Hook，App 仅为布局组件
- **Verification**: `human-judgment`

### AC-3: 运行活动列表优化
- **Given**: 有大量运行活动数据
- **When**: 访问运行活动
- **Then**: 内存占用合理，不会无限增长
- **Verification**: `programmatic`

### AC-4: RightPanel 性能优化
- **Given**: RightPanel 组件
- **When**: 切换不同工具面板
- **Then**: 无不必要的 re-render，切换流畅
- **Verification**: `programmatic` + `human-judgment`

### AC-5: 现有功能保持完整
- **Given**: 修复后的应用
- **When**: 使用所有现有功能
- **Then**: 功能正常，行为与修复前一致
- **Verification**: `programmatic`（测试通过）+ `human-judgment`

## Open Questions
- [ ] 是否要合并 terminal 和 pty 两个 crate？（需要更多讨论）
- [ ] 是否要实现文件内容缓存？（可能增加复杂度，收益待评估）

