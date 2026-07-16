# 重构洞察修复 - The Implementation Plan (Decomposed and Prioritized Task List)

## [x] Task 1: 清理 ui-store.ts 中的 deprecated 代码
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 删除 ui-store.ts 中所有标记为 @deprecated 的代码
  - 清理相关的类型定义和逻辑
  - 确保没有引用被删除的代码
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: TypeScript 类型检查通过（无错误）
  - `programmatic` TR-1.2: 所有前端测试通过
  - `human-judgement` TR-1.3: 代码审查确认已删除的 deprecated 代码不再被引用
- **Notes**: 先确保 uiSlice 中已有相应的替代实现

## [x] Task 2: 优化 MessageBlocks 组件，添加 React.memo
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 为 MessageBlocks 组件添加 React.memo
  - 优化 props 传递，确保合理的比较逻辑
  - 验证优化后的渲染行为
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-2.1: 组件在 props 不变时不会重渲染（可通过 React DevTools 验证）
  - `programmatic` TR-2.2: 所有相关测试通过

## [x] Task 3: 完善 MessageStream 组件
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 分析现有 MessageStream 组件的功能
  - 使其支持完整的消息渲染（包括 MessageBlocks、RunSummaryBlock 等）
  - 保持与 CenterPane 现有逻辑一致的滚动行为
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-3.1: 组件可以正确渲染所有消息类型
  - `human-judgement` TR-3.2: 视觉效果与之前一致

## [x] Task 4: 为 MessageStream 引入 react-window 虚拟滚动
- **Priority**: P0
- **Depends On**: Task 3
- **Description**: 
  - 使用 react-window 的 VariableSizeList 实现虚拟滚动
  - 正确处理消息高度的估算和计算
  - 保持原有的滚动到底部行为
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-4.1: 虚拟滚动正确工作，大量消息时 DOM 元素数量受限
  - `human-judgement` TR-4.2: 滚动性能流畅，无明显卡顿

## [x] Task 5: 更新 CenterPane.tsx 使用 MessageStream 组件
- **Priority**: P0
- **Depends On**: Task 4
- **Description**: 
  - 替换 CenterPane 中的内联消息流渲染
  - 使用完善后的 MessageStream 组件
  - 确保所有现有功能正常工作
- **Acceptance Criteria Addressed**: AC-2, AC-4
- **Test Requirements**:
  - `programmatic` TR-5.1: 消息发送、流式输出、滚动等功能正常
  - `programmatic` TR-5.2: 所有相关测试通过

## [x] Task 6: 评估 terminal 和 pty crate 职责边界
- **Priority**: P1
- **Depends On**: None
- **Description**: 
  - 分析两个 crate 的现有代码结构
  - 确定是否需要实际重构
  - 输出评估报告（如需要重构则制定计划）
- **Acceptance Criteria Addressed**: FR-5
- **Test Requirements**:
  - `human-judgement` TR-6.1: 评估报告清晰说明职责边界问题和建议方案
- **Notes**: 根据评估结果决定是否进一步重构

## [x] Task 7: 运行完整测试和构建验证
- **Priority**: P0
- **Depends On**: Task 1, Task 2, Task 5
- **Description**: 
  - 运行 TypeScript 类型检查
  - 运行所有前端测试
  - 运行 Rust 测试
  - 验证构建成功
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-7.1: 所有 TypeScript 类型检查通过
  - `programmatic` TR-7.2: 所有前端测试通过
  - `programmatic` TR-7.3: 所有 Rust 测试通过
  - `programmatic` TR-7.4: 前端和后端构建成功
