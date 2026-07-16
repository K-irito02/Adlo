# 重构洞察修复计划 - Product Requirement Document

## Overview
- **Summary**: 本计划针对 ai-digital-life 项目最新重构洞察报告中的所有问题进行修复和优化，包括架构清理、性能优化和代码质量提升。
- **Purpose**: 解决项目中的技术债务，提升代码可维护性和运行性能，为后续开发奠定更好的基础。
- **Target Users**: 开发团队、维护人员、贡献者

## Goals
- 清理 ui-store.ts 中的所有 deprecated 代码
- 统一消息流渲染，引入虚拟滚动提升性能
- 优化 MessageBlocks 组件的渲染性能
- 评估并优化 Rust crate 架构
- 提升整体代码质量和可维护性

## Non-Goals (Out of Scope)
- 不进行大规模架构重构（如重写整个状态管理）
- 不添加新的用户功能
- 不修改 API 合约
- 不重构非本次洞察报告中指出的问题

## Background & Context
项目已完成多次重构，整体架构良好，但仍存在一些技术债务：
- 旧的 ui-store.ts 中有大量 deprecated 代码需要清理
- 消息流组件存在重复且未使用虚拟滚动
- Rust crate 职责边界有优化空间
- 已有 react-window 依赖，但未实际使用

## Functional Requirements
- **FR-1**: 清理 ui-store.ts 中所有 @deprecated 标记的代码
- **FR-2**: 统一使用 MessageStream 组件渲染消息流
- **FR-3**: 为 MessageStream 引入 react-window 虚拟滚动
- **FR-4**: 为 MessageBlocks 组件添加 React.memo 优化
- **FR-5**: 评估 terminal 和 pty crate 的职责边界

## Non-Functional Requirements
- **NFR-1**: 消息流在 100+ 消息时仍保持 60fps 滚动
- **NFR-2**: 清理后的代码应无 TypeScript 类型错误
- **NFR-3**: 所有现有测试应通过
- **NFR-4**: 构建体积不应显著增加

## Constraints
- **Technical**: 保持现有 Zustand 切片架构、保持现有 Rust crate 结构不变
- **Business**: 所有修复应在不破坏现有功能的前提下进行
- **Dependencies**: react-window 已作为依赖存在，无需新增

## Assumptions
- 用户对现有功能满意，只需优化
- 测试覆盖足够验证修复不会破坏功能
- 现有架构可以支持本次所有修复

## Acceptance Criteria

### AC-1: Deprecated 代码清理
- **Given**: ui-store.ts 文件存在多个 @deprecated 标记
- **When**: 执行清理后
- **Then**: 所有 @deprecated 代码和相关逻辑已移除，无 TypeScript 错误
- **Verification**: `programmatic`

### AC-2: 消息流统一和虚拟滚动
- **Given**: CenterPane.tsx 中内联渲染消息流
- **When**: 重构为使用 MessageStream 组件并引入虚拟滚动
- **Then**: MessageStream 组件被正确使用，消息列表支持 react-window 虚拟化
- **Verification**: `programmatic` + `human-judgment`

### AC-3: MessageBlocks 性能优化
- **Given**: MessageBlocks 组件存在
- **When**: 添加 React.memo 优化后
- **Then**: 组件在 props 不变时不会重渲染
- **Verification**: `programmatic`

### AC-4: 测试全部通过
- **Given**: 所有修复完成
- **When**: 运行完整测试套件
- **Then**: 所有 TypeScript 类型检查、前端测试、Rust 测试都通过
- **Verification**: `programmatic`

## Open Questions
- [ ] terminal 和 pty crate 的职责边界是否需要实际重构，还是仅评估即可？
