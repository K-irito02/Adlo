/**
 * Stores 模块索引文件
 * 提供渐进式 Store 重构的入口点
 */

// 导出所有工具模块
export * from "./cacheUtils";
export * from "./conversationUtils";
export * from "./shared";

// 导出切片定义
export * from "./slices";

// 导出完整的 StoreState
export { type StoreState } from "./StoreState";

// 导出完整的 store
export { useAppStore, useSlicedAppStore } from "./slicedStore";

// 导出通用选择器
export * from "./selectors";
