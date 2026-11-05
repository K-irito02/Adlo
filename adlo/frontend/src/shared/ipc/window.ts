/**
 * 窗口控制相关桥接能力
 * 用于: 控制应用窗口最小化/最大化/关闭/标题更新
 * Tauri 命令: 直接使用 window API
 * 浏览器模式: 无操作 UI 模拟
 */
import type { IpcResult } from '@adlo/kernel';

export interface WindowBridge {
  /**
   * 最小化窗口
   * @command 无独立命令 (通过 Tauri window API 直接调用)
   * @see tauri-bridge.ts → window.minimize
   * @see mock-bridge.ts → window.minimize
   * @see preview-bridge/index.ts → window.minimize
   */
  minimize: () => Promise<void>;
  /**
   * 切换最大化状态
   * @command 无独立命令 (通过 Tauri window API 直接调用)
   * @see tauri-bridge.ts → window.maximize
   * @see mock-bridge.ts → window.maximize
   * @see preview-bridge/index.ts → window.maximize
   */
  maximize: () => Promise<void>;
  /**
   * 关闭窗口
   * @command 无独立命令 (通过 Tauri window API 直接调用)
   * @see tauri-bridge.ts → window.close
   * @see mock-bridge.ts → window.close
   * @see preview-bridge/index.ts → window.close
   */
  close: () => Promise<void>;
  /**
   * 查询当前窗口是否处于最大化状态
   * @returns 窗口是否最大化
   * @command 无独立命令 (通过 Tauri window API 直接调用)
   * @see tauri-bridge.ts → window.isMaximized
   * @see mock-bridge.ts → window.isMaximized
   * @see preview-bridge/index.ts → window.isMaximized
   */
  isMaximized: () => Promise<boolean>;
  /**
   * 更新窗口标题
   * @param title 新的窗口标题
   * @command 无独立命令 (通过 Tauri window API 直接调用)
   * @see tauri-bridge.ts → window.setTitle
   * @see mock-bridge.ts → window.setTitle
   * @see preview-bridge/index.ts → window.setTitle
   */
  setTitle: (title: string) => Promise<void>;
  /**
   * 订阅窗口大小变化事件 (包括最大化/还原)
   * @param listener 窗口大小变化时的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过 Tauri window.onResized API)
   * @see tauri-bridge.ts → window.onResized
   * @see mock-bridge.ts → window.onResized
   * @see preview-bridge/index.ts → 继承 mock-bridge
   */
  onResized: (listener: () => void) => () => void;
  /**
   * 显示窗口（用于窗口初始隐藏后，应用加载完成后再显示）
   * @command core:window:allow-show
   * @see tauri-bridge.ts → window.show
   * @see mock-bridge.ts → window.show
   */
  show: () => Promise<void>;
  /**
   * 在系统默认浏览器中打开外部 URL
   * @param url 要打开的 URL
   * @command 无独立命令 (Tauri 模式通过 @tauri-apps/plugin-shell 的 open() 实现)
   * @see tauri-bridge.ts → window.openExternal
   * @see mock-bridge.ts → window.openExternal
   * @see preview-bridge/index.ts → window.openExternal
   */
  openExternal: (url: string) => Promise<void>;
  /**
   * 在系统文件管理器中打开一个目录（不存在时先创建）。
   * 仅用于「关于」页的日志目录；不是通用文件打开器。
   * @command platform_open_path
   * @see tauri-bridge.ts → window.openPath
   * @see mock-bridge.ts → window.openPath
   * @see preview-bridge/index.ts → window.openPath
   */
  openPath: (path: string) => Promise<IpcResult<boolean>>;
}
