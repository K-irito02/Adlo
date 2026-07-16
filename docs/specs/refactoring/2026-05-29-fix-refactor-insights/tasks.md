# 重构洞察问题修复 - The Implementation Plan (Decomposed and Prioritized Task List)

## [x] Task 1: MessageStream 虚拟滚动实现
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 引入 react-window 库实现虚拟滚动
  - 重构 MessageStream 组件使用 VariableSizeList
  - 保持现有样式和交互功能不变
- **Acceptance Criteria Addressed**: [AC-1, AC-5]
- **Test Requirements**:
  - `programmatic` TR-1.1: 渲染 1000 条消息时，DOM 元素数量不超过 50 个
  - `programmatic` TR-1.2: 所有现有前端测试通过
  - `human-judgement` TR-1.3: 滚动流畅，消息气泡样式正确，无布局问题
- **Notes**: 需要测量消息气泡高度，处理可变高度的消息

## [x] Task 2: RightPanel 组件 re-render 优化
- **Priority**: P1
- **Depends On**: None
- **Description**: 
  - 为 RightPanel 所有面板 props 添加 useMemo/useCallback
  - 优化 useRightPanelViewProps、useFilesPanelProps 等 Hook
  - 确保 ActiveToolPanel 的 memo 真正生效
- **Acceptance Criteria Addressed**: [AC-4, AC-5]
- **Test Requirements**:
  - `programmatic` TR-2.1: 使用 React DevTools Profiler 验证不必要的 re-render 已消除
  - `programmatic` TR-2.2: 所有现有前端测试通过
  - `human-judgement` TR-2.3: 工具面板切换流畅无延迟

## [x] Task 3: App 组件业务逻辑拆分
- **Priority**: P1
- **Depends On**: None
- **Description**: 
  - 创建 useAppStartup Hook 处理启动逻辑
  - 创建 usePatchReviewWithEditor Hook 组合补丁审查和编辑器功能
  - App 组件只保留布局和组合逻辑
- **Acceptance Criteria Addressed**: [AC-2, AC-5]
- **Test Requirements**:
  - `programmatic` TR-3.1: 所有现有前端测试通过
  - `human-judgement` TR-3.2: App.tsx 代码行数减少，只包含布局逻辑
  - `human-judgement` TR-3.3: 自定义 Hook 职责清晰，可复用

## [x] Task 4: 运行活动列表优化
- **Priority**: P1
- **Depends On**: None
- **Description**: 
  - 优化 streamActions.ts 中的运行活动列表管理
  - 实现更智能的数据截断或归档机制
  - 保持 UI 展示不受影响
- **Acceptance Criteria Addressed**: [AC-3, AC-5]
- **Test Requirements**:
  - `programmatic` TR-4.1: 内存占用测试，验证不会无限增长
  - `programmatic` TR-4.2: 所有现有前端测试通过

## [x] Task 5: 命令处理注册表模式（可选）
- **Priority**: P2
- **Depends On**: None
- **Description**: 
  - 重构 dispatchSlashCommand 为注册表模式
  - 支持动态注册命令处理器
  - 保持现有命令功能不变
- **Acceptance Criteria Addressed**: [AC-5]
- **Test Requirements**:
  - `programmatic` TR-5.1: 所有现有命令功能正常
  - `programmatic` TR-5.2: 所有现有前端测试通过
  - `human-judgement` TR-5.3: 代码结构更清晰，扩展性更好

## [x] Task 6: MessageBlocks 组件工厂模式（可选）
- **Priority**: P2
- **Depends On**: None
- **Description**: 
  - 为每种消息块类型创建独立组件
  - 实现组件注册表
  - 替换大型 if-else 分支
- **Acceptance Criteria Addressed**: [AC-5]
- **Test Requirements**:
  - `programmatic` TR-6.1: 所有消息块类型渲染正确
  - `programmatic` TR-6.2: 所有现有前端测试通过
  - `human-judgement` TR-6.3: 代码结构更清晰，易于添加新块类型

## [x] Task 7: 其他小优化
- **Priority**: P2
- **Depends On**: None
- **Description**: 
  - outline crate 中用简单计数器替代 BTreeMap
  - mock-bridge 添加可选的 localStorage 持久化
  - 其他代码质量小改进
- **Acceptance Criteria Addressed**: [AC-5]
- **Test Requirements**:
  - `programmatic` TR-7.1: 所有 Rust 和前端测试通过
  - `human-judgement` TR-7.2: 代码无退化

