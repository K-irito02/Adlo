# 重构洞察修复 - The Implementation Plan (Decomposed and Prioritized Task List)

## [x] Task 1: 清理 ui-store.ts 中的 @deprecated 终端代码
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 删除 ui-store.ts 中标记为 @deprecated 的 TerminalTabState 类型
  - 删除相关的终端常量
  - 删除空实现的 setTerminalNavigatorWidth 函数
  - 检查并更新所有导入处的引用
- **Acceptance Criteria Addressed**: [AC-1]
- **Test Requirements**:
  - `programmatic` TR-1.1: TypeScript 编译检查通过，无错误
  - `programmatic` TR-1.2: 所有现有测试通过
  - `human-judgement` TR-1.3: 代码审查确认 deprecated 代码已清理
- **Notes**: 仔细检查是否有其他地方还在引用这些 deprecated 代码

## [x] Task 2: 统一 localStorage 工具函数到共享模块
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 在 stores/shared.ts 中提取公共的 localStorage 工具函数
  - 包括：readJson, writeJson, readNumber, writeNumber, clamp 等
  - 更新 terminalSlice.ts 使用共享函数
  - 更新 ui-store.ts 使用共享函数
  - 更新 browserSlice.ts 使用共享函数
- **Acceptance Criteria Addressed**: [AC-2]
- **Test Requirements**:
  - `programmatic` TR-2.1: 所有工具函数正确工作
  - `programmatic` TR-2.2: 所有测试通过
  - `human-judgement` TR-2.3: 代码审查确认无重复实现

## [x] Task 3: 优化 MessageStream 组件的虚拟滚动
- **Priority**: P1
- **Depends On**: None
- **Description**: 
  - 优化 streamItems 的 memoization
  - 优化 rowProps 的 memoization
  - 优化 useDynamicRowHeight 使用
  - 确保组件性能测试对比
- **Acceptance Criteria Addressed**: [AC-3]
- **Test Requirements**:
  - `human-judgement` TR-3.1: 功能测试通过，无渲染性能提升
  - `programmatic` TR-3.2: 所有测试通过
  - `human-judgement` TR-3.3: 代码审查确认优化正确

## [x] Task 4: 统一浏览器功能状态管理
- **Priority**: P1
- **Depends On**: Task 2
- **Description**: 
  - 将 ui-store.ts 中的浏览器相关状态完全迁移到 browserSlice
  - 更新相关导入
  - 确保功能正常
- **Acceptance Criteria Addressed**: [AC-4]
- **Test Requirements**:
  - `programmatic` TR-4.1: 所有浏览器功能正常工作
  - `programmatic` TR-4.2: 所有测试通过

## [x] Task 5: 优化终端 localStorage 批处理
- **Priority**: P2
- **Depends On**: Task 2
- **Description**: 
  - 实现更完善的批量写入调度器
  - 使用防抖或时间窗口合并
  - 减少 localStorage I/O
- **Acceptance Criteria Addressed**: [AC-5]
- **Test Requirements**:
  - `human-judgement` TR-5.1: 批量写入功能正常
  - `programmatic` TR-5.2: 所有测试通过

## [x] Task 6: 添加 Rust 后端文件内容缓存
- **Priority**: P2
- **Depends On**: None
- **Description**: 
  - 在 workspace crate 中实现文件内容缓存
  - 基于 last_modified_at 时间戳判断
  - 减少重复 I/O
- **Acceptance Criteria Addressed**: [AC-6]
- **Test Requirements**:
  - `programmatic` TR-6.1: 所有 Rust 测试通过
  - `human-judgement` TR-6.2: 性能测试验证

## [x] Task 7: 运行所有测试并验证
- **Priority**: P0
- **Depends On**: Task 1, 2, 3, 4, 5, 6
- **Description**: 
  - 运行所有前端测试
  - 运行所有 Rust 测试
  - 运行类型检查
  - 手动功能验证
- **Acceptance Criteria Addressed**: [AC-6]
- **Test Requirements**:
  - `programmatic` TR-7.1: 所有前端测试通过
  - `programmatic` TR-7.2: 所有 Rust 测试通过
  - `programmatic` TR-7.3: TypeScript 类型检查通过
