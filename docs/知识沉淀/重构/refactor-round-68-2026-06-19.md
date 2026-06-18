# Round 68 重构经验总结

**日期**: 2026-06-19
**范围**: CSS 架构规范化 + 前端大型文件减负 + Rust 模块化 + 生产代码清理

## 成功模式

### 1. CSS Barrel 模式推广
`components.css` 转型为纯 barrel 文件（仅 @import），所有内联样式分散到独立组件 CSS 文件中。这一模式的优势：
- 新增组件样式只需创建 `components/xxx.css` 并加入 barrel，无需修改 barrel 文件
- 文件职责单一，查找和调试更高效
- 非常适合扩展，后续新增组件样式遵循此模式即可

### 2. Store Slice 三层拆分
大型 slice 文件（500+ 行）采用"类型提取 + helpers 提取 + slice 编排"三层拆分：
- **types**: 类型定义（`xxxSliceTypes.ts`）
- **helpers**: 纯函数工具（`xxxSliceHelpers.ts`） 
- **slice**: 编排逻辑（`xxxSlice.ts`）
- 这一模式不会破坏 store 的合并过程（`createAppStore` 不受影响），且类型和纯函数可独立测试

### 3. 大型组件提取子组件
StatusBar (560行) 和 FileNavigatorShell (624行) 的拆分验证了：
- 通过 Props 接口传递数据，而非共享 store 订阅
- 父组件保持编排职责，子组件专注渲染
- 提升 tree-shake 能力和缓存复用率

## 限制与注意

### 1. useTaskCenterPolling 无法事件驱动
Tauri 内部有 `AppEvent::TaskCreated` 事件总线，但仅限 `tokio::sync::broadcast` 广播，**未通过 `app.emit()` 暴露到前端**。前端无法订阅。若后续需要事件驱动，需在 Rust 侧实现：

```rust
// 在 task_manager 创建 task 后：
let _ = app.emit("digital-life://task-updated", ());
```

### 2. 测试过时风险
提取/拆分文件后，引用原文件的测试可能因为断言目标变更而失败（如 `outlinePanelWiring.test.ts` 中 src 断言移至新文件）。解决方法：
- 测试文件同时引用原文件和新文件
- 或将测试也按相同维度拆分

### 3. Console.log 清理的策略
保留 `ErrorBoundary` 中的 console.error（1处）和 `debugLogCollector.ts`（调试工具）。其他所有 console 调用（29处）要么是边缘情况的静默处理（如 localStorage 写入失败），要么是无实际价值的调试输出。**工具函数中捕获的错误不应通过 console 打印**——silent catch 更干净。

## CSS 文件规范

本轮确立了 CSS 文件拆分规范：

1. **组件 CSS**：放到 `styles/components/` 下，每个文件 ≤ 200 行
2. **区域 CSS**：`styles/regions/` 按区域拆分，子视图独立文件
3. **Barrel 文件**：负责 `@import` 子文件，不包含任何实际样式
4. **阈值**：1000 行（硬限制），建议保持在 500 行以下

## 参考
- 重构洞察报告（本轮）：`docs/重构洞察/refactor-insight-2026-06-19.md`
- 实施计划：`.trae/specs/refactor-insight-2026-06-19/spec.md`
- 任务清单：`.trae/specs/refactor-insight-2026-06-19/tasks.md`