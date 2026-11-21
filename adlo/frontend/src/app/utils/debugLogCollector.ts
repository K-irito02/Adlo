/**
 * 调试日志收集器
 * 自动将所有 console 输出（log, warn, error, info, debug）写入选定日志文件，
 * 并暴露 `window.__dlDebugLogs` / `window.__exportDebugLogs` 供 Agent / 控制台读取
 * （界面不再提供复制按钮）。
 */

import { isTauriShell } from '../../tauri-bridge';
import { resolveEffectiveDebugLogModeFromParts } from '@utils/debugLogMode';
import type { LogMode } from '@shared/ipc-types.generated';

// ============================================
// 类型定义
// ============================================

interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: unknown[];
}

// ============================================
// 配置常量
// ============================================

const MAX_LOGS = 1000;
const LOG_WRITE_DEBOUNCE_MS = 3000; // 防抖延迟 3s

// ============================================
// 全局状态
// ============================================

const debugLogs: LogEntry[] = [];
let writeTimeoutId: ReturnType<typeof setTimeout> | null = null;
let isWriting = false;

// 保存原始 console 方法
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalInfo = console.info;
const originalDebug = console.debug;

// ============================================
// 工具函数
// ============================================

/**
 * 将任意值安全地序列化为字符串
 */
function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 将参数数组序列化为字符串
 */
function argsToString(args: unknown[]): string {
  return args.map(safeStringify).join(' ');
}

// ============================================
// 日志核心功能
// ============================================

/**
 * 生成北京时间（CST, UTC+8）的时间戳字符串
 */
function getCSTTimestamp(): string {
  const now = new Date();
  const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = cst.getUTCFullYear();
  const month = String(cst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(cst.getUTCDate()).padStart(2, '0');
  const hours = String(cst.getUTCHours()).padStart(2, '0');
  const minutes = String(cst.getUTCMinutes()).padStart(2, '0');
  const seconds = String(cst.getUTCSeconds()).padStart(2, '0');
  const ms = String(cst.getUTCMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * 收集单条日志
 */
function collectLog(level: LogEntry['level'], ...args: unknown[]) {
  debugLogs.push({
    timestamp: getCSTTimestamp(),
    level,
    args,
  });

  // 保持最近 MAX_LOGS 条
  if (debugLogs.length > MAX_LOGS) {
    debugLogs.shift();
  }

  // 防抖写入文件（仅当不在写入中时触发，避免并发写 + 死锁）
  if (!isWriting) {
    debouncedWriteLogs();
  }
}

/**
 * 防抖写入文件
 */
function debouncedWriteLogs() {
  if (writeTimeoutId) {
    clearTimeout(writeTimeoutId);
  }
  writeTimeoutId = setTimeout(() => {
    void writeLogsToProjectFile();
    writeTimeoutId = null;
  }, LOG_WRITE_DEBOUNCE_MS);
}

/**
 * 将日志导出为文本格式
 */
function exportLogsAsText(): string {
  return debugLogs
    .map((log) => {
      const msg = argsToString(log.args);
      return `[${log.timestamp}] [${log.level.toUpperCase()}] ${msg}`;
    })
    .join('\n');
}

/**
 * 清除所有日志
 */
function clearLogs(): void {
  debugLogs.length = 0;
}

/**
 * 获取结构化日志
 */
function getDebugLogs(): { timestamp: string; level: string; message: string }[] {
  return debugLogs.map((log) => ({
    timestamp: log.timestamp,
    level: log.level,
    message: argsToString(log.args),
  }));
}

/**
 * 获取应用程序目录路径（浏览器模式）
 */
let cachedAppDirectory: string | null = null;
let lastAppDirAttempt = 0;
let appDirCacheReady = false;
const APP_DIR_CACHE_TTL_MS = 30000;

async function getAppDirectory(): Promise<string | null> {
  const now = Date.now();
  if (appDirCacheReady && now - lastAppDirAttempt < APP_DIR_CACHE_TTL_MS) {
    return cachedAppDirectory;
  }
  lastAppDirAttempt = now;
  appDirCacheReady = true;
  try {
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('/__adl_preview_api__/workspace/app-directory', {
      signal: controller.signal,
    });
    clearTimeout(fetchTimeout);
    if (!response.ok) {
      cachedAppDirectory = null;
      return null;
    }
    const result = await response.json();
    cachedAppDirectory = result.data || null;
    return cachedAppDirectory;
  } catch {
    cachedAppDirectory = null;
    return null;
  }
}

// ============================================
// 文件写入功能
// ============================================

const WRITE_TIMEOUT_MS = 10_000;

/**
 * 写入日志到项目目录
 */
async function writeLogsToProjectFile() {
  if (isWriting) {
    return;
  }

  try {
    isWriting = true;
    const logContent = exportLogsAsText();

    const writePromise = isTauriShell()
      ? (await import('@tauri-apps/api/core')).invoke('write_debug_logs_to_project', {
          content: logContent,
        })
      : writeLogsToProjectFileBrowser(logContent);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Write timeout')), WRITE_TIMEOUT_MS),
    );

    await Promise.race([writePromise, timeoutPromise]);
  } catch (err) {
    // 静默失败，但至少输出到原始 console，避免干扰正常调试
    originalError('[DebugLogCollector] Failed to write logs:', err);
  } finally {
    isWriting = false;
  }
}

/**
 * 读当前生效的调试日志模式（浏览器模式）。
 *
 * 优先级：CLI/env 覆盖（启动脚本注入的 `VITE_ADL_DEBUG_LOG_MODE`）→ 用户设置
 * （`appInfo.config.debugLogMode`，经 `/app/info` 读取）→ 默认 `overwrite`。
 * 取代此前读取 `localStorage['adl_log_mode_debug']` 的实现 —— 该键的写端
 * `setLogMode` 全仓库零调用方，实践中恒为 fallback，设置项因此不生效（Issue 5）。
 */
async function resolveEffectiveDebugLogMode(): Promise<LogMode> {
  return resolveEffectiveDebugLogModeFromParts(
    import.meta.env.VITE_ADL_DEBUG_LOG_MODE,
    await readAppInfoDebugLogMode(),
  );
}

/** 延迟 import store：避免 utils → stores 的模块级循环依赖。 */
async function readAppInfoDebugLogMode(): Promise<string | undefined> {
  try {
    const { useAppStore } = await import('@stores/slicedStore');
    return useAppStore.getState().appInfo?.config.debugLogMode;
  } catch {
    return undefined;
  }
}

/**
 * 写入日志到项目目录（浏览器模式）
 */
async function writeLogsToProjectFileBrowser(content: string) {
  const appDirectory = await getAppDirectory();
  if (!appDirectory) {
    return;
  }

  const mode = await resolveEffectiveDebugLogMode();

  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 3000);
  const response = await fetch('/__adl_preview_api__/workspace/write-debug-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rootPath: appDirectory, content, mode }),
    signal: controller.signal,
  });
  clearTimeout(fetchTimeout);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

// ============================================
// Console 拦截
// ============================================

/**
 * 重写 console 方法
 */
function interceptConsole() {
  console.log = (...args: unknown[]) => {
    collectLog('log', ...args);
    originalLog.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    collectLog('warn', ...args);
    originalWarn.apply(console, args);
  };
  console.error = (...args: unknown[]) => {
    collectLog('error', ...args);
    originalError.apply(console, args);
  };
  console.info = (...args: unknown[]) => {
    collectLog('info', ...args);
    originalInfo.apply(console, args);
  };
  console.debug = (...args: unknown[]) => {
    collectLog('debug', ...args);
    originalDebug.apply(console, args);
  };
}

/**
 * 拦截全局运行时错误
 */
function interceptGlobalErrors() {
  window.addEventListener('error', (event) => {
    collectLog(
      'error',
      `[UncaughtError] ${event.message} (${event.filename}:${event.lineno}:${event.colno})`,
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    collectLog('error', `[UnhandledRejection] ${reason}`);
  });
}

/**
 * 恢复原始 console
 */
function restoreConsole() {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
  console.info = originalInfo;
  console.debug = originalDebug;
}

// ============================================
// 初始化和暴露
// ============================================

if (typeof window !== 'undefined') {
  // 拦截 console
  interceptConsole();
  // 拦截全局错误
  interceptGlobalErrors();

  // 暴露 API 到全局
  const global = window as unknown as Record<string, unknown>;
  global.__dlDebugLogs = debugLogs;
  global.__getDebugLogs = getDebugLogs;
  global.__exportDebugLogs = exportLogsAsText;
  global.__clearDebugLogs = clearLogs;
  global.__restoreConsole = restoreConsole;
  global.__forceFlushDebugLogs = async () => {
    if (writeTimeoutId) {
      clearTimeout(writeTimeoutId);
      writeTimeoutId = null;
    }
    await writeLogsToProjectFile();
  };
}

export { getDebugLogs, exportLogsAsText, clearLogs, restoreConsole };
