# Store 架构指南

## 架构

```
store.ts (主 Store)
├── slices/           # 11 个切面（数据）
│   ├── uiSlice.ts          # UI 布局/侧栏/工具
│   ├── workspaceSlice.ts   # 工作区元数据
│   ├── gitSlice.ts         # Git 分支与快照
│   ├── sessionSlice.ts     # 会话/消息流
│   ├── editorSlice.ts      # 编辑器/文件标签
│   ├── patchSlice.ts       # 补丁状态
│   ├── searchSlice.ts      # 搜索查询/结果
│   ├── diagnosticSlice.ts  # 诊断/索引/仓库地图
│   ├── taskSlice.ts        # 任务中心
│   ├── commandSlice.ts     # 命令历史
│   └── clipboardSlice.ts   # 剪贴板路径
│
├── actions/          # 9 个操作模块（逻辑）
│   ├── workspaceActions.ts   # 工作区树/刷新
│   ├── gitActions.ts         # Git 切换/创建分支
│   ├── searchActions.ts      # 文件搜索
│   ├── sessionActions.ts     # 会话消息
│   ├── editorActions.ts      # 文件打开/编辑
│   ├── patchActions.ts       # 补丁审批/应用
│   ├── fetchActions.ts       # 数据拉取
│   ├── taskActions.ts        # 任务审批/检查点
│   └── commandActions.ts     # 命令执行
│
├── selectors.ts      # 记忆化选择器（useShallow）
├── localStorageUtils.ts  # localStorage JSON 工具
├── storageScheduler.ts   # 批量写入调度器
└── shared.ts         # 共享工具
```

## 原则

1. **切片是数据**：切面只定义状态和 setter，不含业务逻辑
2. **Actions 是逻辑**：跨切片操作在 actions/ 中实现
3. **选择器优化**：Record/Object 类型用 `useShallow` 包裹
4. **向后兼容**：`ui-store.ts` 的字段标记 `@deprecated`，逐步迁移到 `useAppStore`
