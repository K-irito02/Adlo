import type {
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  DigitalLifeTerminalStreamEventV1,
} from '@ai-digital-life/kernel';

export type {
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  DigitalLifeTerminalStreamEventV1,
};

import type { PtyOutputEvent } from './pty';
import type { ClipboardBridge } from './clipboard';
import type { SystemMonitorBridge } from './system_monitor';
import type { WindowBridge } from './window';
import type { AppBridge } from './app';
import type { WorkspaceBridge } from './workspace';
import type { RetrievalBridge } from './retrieval';
import type { DshBridge } from './dsh';
import type { OpencodeBridge } from './opencode';
import type { EnvBridge } from './env';
import type { PatchBridge } from './patch';
import type { PtyBridge } from './pty';
import type { BrowserBridge } from './browser';
import type { GitHubBridge } from './github';
import type { SnapshotBridge } from './snapshot';
import type { ReferenceBridge } from './reference';
import type { DurableBridge } from './durable';
import type { ReservedBridge } from './reserved';
import type { StorageBridge } from './storage';

/** SSE wire event type (formerly in part-stream/partStoreTypes) */
export type SseWireEvent =
  | { type: 'message.created'; sessionID: string; info: { id: string } & Record<string, unknown> }
  | { type: 'message.updated'; sessionID: string; info: { id: string } & Record<string, unknown> }
  | {
      type: 'message.part.updated';
      sessionID: string;
      messageID: string;
      partID: string;
      part: Record<string, unknown>;
    }
  | {
      type: 'message.part.delta';
      sessionID: string;
      messageID: string;
      partID: string;
      field: string;
      delta: string;
    }
  | { type: 'session.status'; sessionID: string; status: string }
  | {
      type: 'question.asked';
      sessionID: string;
      requestID: string;
      questions: unknown[];
      tool?: unknown;
    }
  | { type: 'question.replied'; sessionID: string; requestID: string; answers: unknown[] };

/**
 * Digital Life 全局桥接接口 - 汇总所有子能力
 * 用于: 作为 window.digitalLife 的类型, 提供事件订阅与各子模块访问入口
 * 实现: tauri-bridge.ts (Tauri 应用), mock-bridge.ts (浏览器 mock), preview-bridge (预览模式)
 */
export interface DigitalLifeBridge {
  /**
   * 订阅模型输出流事件
   * @param listener 接收模型流式事件 (token/event) 的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://model-stream)
   * @see tauri-bridge.ts → subscribeModelStream
   * @see mock-bridge.ts → subscribeModelStream
   * @see preview-bridge/index.ts → subscribeModelStream
   */
  subscribeModelStream: (listener: (event: DigitalLifeModelStreamEventV1) => void) => () => void;
  /**
   * 订阅 Agent 运行活动流事件
   * @param listener 接收运行活动事件的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://run-activity)
   * @see tauri-bridge.ts → subscribeRunActivity
   * @see mock-bridge.ts → subscribeRunActivity
   * @see preview-bridge/index.ts → subscribeRunActivity
   */
  subscribeRunActivity: (listener: (event: DigitalLifeRunActivityEventV1) => void) => () => void;
  /**
   * 订阅终端输出流事件
   * @param listener 接收终端流式事件的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://terminal-stream)
   * @see tauri-bridge.ts → subscribeTerminalStream
   * @see mock-bridge.ts → subscribeTerminalStream
   * @see preview-bridge/index.ts → subscribeTerminalStream
   */
  subscribeTerminalStream: (
    listener: (event: DigitalLifeTerminalStreamEventV1) => void,
  ) => () => void;
  /**
   * 订阅 PTY 终端输出事件
   * @param listener 接收 PTY 输出事件的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://pty-output)
   * @see tauri-bridge.ts → subscribePtyOutput
   * @see mock-bridge.ts → subscribePtyOutput
   * @see preview-bridge/index.ts → subscribePtyOutput
   */
  subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) => () => void;
  /**
   * 订阅会话 Part 原始 SSE 事件流（S2 Part 渲染内核）。
   * 与 `subscribeModelStream` 共用同一 `/event` EventSource 基建，但**不做 v1
   * 映射**：每个解析后的 `SseWireEvent` 记录原样转发（消息/Part/状态/提问），
   * 由监听方自行按 `sessionID` 过滤。冷启动走 `?after=latest`，之后从最近
   * 消费的 event_log seq 恢复。
   * @param listener 接收原始 `/event` 解析后的 `SseWireEvent` 记录
   * @returns 取消订阅的函数（同步）
   * @command 无独立命令（通过 ad-server `/event` SSE）
   * @see tauri-bridge.ts → subscribeSessionPartEvents（`...http` 委托 httpBridge）
   * @see preview-bridge/index.ts → subscribeSessionPartEvents（委托 httpBridge）
   * @see mock-bridge.ts → subscribeSessionPartEvents
   */
  subscribeSessionPartEvents: (listener: (event: SseWireEvent) => void) => () => void;
  /** 窗口控制子模块 */
  window: WindowBridge;
  /** 应用信息与健康状态子模块 */
  app: AppBridge;
  /** 工作区管理子模块 */
  workspace: WorkspaceBridge;
  /** 内容索引与检索子模块 */
  retrieval: RetrievalBridge;
  /** dsh 宿主壳子模块 (拉起/关闭 + 版本管理) */
  dsh: DshBridge;
  opencode: OpencodeBridge;
  /** 环境依赖管理子模块 (检测/安装/来源偏好，`GET /env/status` + `POST /env/*`) */
  env: EnvBridge;
  /** 补丁管理子模块 */
  patch: PatchBridge;
  /** PTY 终端子模块 */
  pty: PtyBridge;
  /** 浏览器预览子模块 */
  browser: BrowserBridge;
  /** GitHub 集成子模块 (GitHub + CI 状态共用同一接口) */
  github: GitHubBridge;
  /** 快照管理子模块 */
  snapshot: SnapshotBridge;
  /** 参考代码仓库管理子模块 */
  reference: ReferenceBridge;
  /** 持久化会话管理子模块 */
  durable: DurableBridge;
  /** 预留功能 IPC 存根子模块 */
  reserved: ReservedBridge;
  /** 系统剪贴板历史子模块 */
  clipboard: ClipboardBridge;
  /** 系统状态监控子模块 */
  systemMonitor: SystemMonitorBridge;
  /** 存储路径管理子模块 (状态/预检/切换/重启) */
  storage: StorageBridge;
}
