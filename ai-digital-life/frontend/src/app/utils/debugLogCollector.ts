/**
 * 调试日志收集器
 * 自动将所有 console 输出（log, warn, error, info, debug）写入文件或显示可拖拽复制按钮
 */

import { isTauriShell } from '../../tauri-bridge';

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
const LOG_WRITE_DEBOUNCE_MS = 500; // 防抖延迟 500ms

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
  if (typeof value === 'string') return value;
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
 * 收集单条日志
 */
function collectLog(level: LogEntry['level'], ...args: unknown[]) {
  // 防止收集过程中不执行新的日志导致的无限循环
  if (isWriting) return;

  debugLogs.push({
    timestamp: new Date().toISOString(),
    level,
    args,
  });

  // 保持最近 MAX_LOGS 条
  if (debugLogs.length > MAX_LOGS) {
    debugLogs.shift();
  }

  // 防抖写入文件
  debouncedWriteLogs();
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
function getDebugLogs(): Array<{ timestamp: string; level: string; message: string }> {
  return debugLogs.map((log) => ({
    timestamp: log.timestamp,
    level: log.level,
    message: argsToString(log.args),
  }));
}

/**
 * 获取应用程序目录路径（浏览器模式）
 */
async function getAppDirectory(): Promise<string | null> {
  try {
    const response = await fetch('/__adl_preview_api__/workspace/app-directory');
    if (!response.ok) return null;
    const result = await response.json();
    return result.data || null;
  } catch {
    return null;
  }
}

// ============================================
// 文件写入功能
// ============================================

/**
 * 写入日志到项目目录
 */
async function writeLogsToProjectFile() {
  if (isWriting) return;

  try {
    isWriting = true;
    const logContent = exportLogsAsText();

    if (isTauriShell()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_debug_logs_to_project', { content: logContent });
    } else {
      await writeLogsToProjectFileBrowser(logContent);
    }
  } catch (err) {
    // 静默失败，但至少输出到原始 console，避免干扰正常调试
    originalError('[DebugLogCollector] Failed to write logs:', err);
  } finally {
    isWriting = false;
  }
}

/**
 * 写入日志到项目目录（浏览器模式）
 */
async function writeLogsToProjectFileBrowser(content: string) {
  const appDirectory = await getAppDirectory();
  if (!appDirectory) return;

  const response = await fetch('/__adl_preview_api__/workspace/write-debug-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rootPath: appDirectory, content }),
  });

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
// 可拖拽按钮功能
// ============================================

function createDraggableCopyButton() {
  if (typeof document === 'undefined') return;

  // 移除已存在的按钮
  const existing = document.getElementById('__dl-debug-button');
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.id = '__dl-debug-button';
  btn.textContent = '复制调试日志';
  btn.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 99999;
    padding: 8px 16px;
    background: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: move;
    font-size: 12px;
    user-select: none;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    transition: opacity 0.2s;
  `;

  // 拖拽状态
  let hasMoved = false;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  // 点击复制（只有非拖拽时才会触发）
  btn.onclick = async (e) => {
    if (hasMoved) return;
    e.stopPropagation();
    try {
      const logs = exportLogsAsText();
      await navigator.clipboard.writeText(logs);
      btn.textContent = '已复制!';
      btn.style.background = '#4caf50';
      setTimeout(() => {
        btn.textContent = '复制调试日志';
        btn.style.background = '#007acc';
      }, 1500);
    } catch (err) {
      originalError('[DebugLogCollector] Failed to copy logs:', err);
      btn.textContent = '复制失败';
      btn.style.background = '#f44336';
      setTimeout(() => {
        btn.textContent = '复制调试日志';
        btn.style.background = '#007acc';
      }, 1500);
    }
  };

  // 拖拽开始
  btn.onmousedown = (e) => {
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = btn.offsetLeft;
    startTop = btn.offsetTop;
    btn.style.cursor = 'grabbing';
    btn.style.opacity = '0.8';
  };

  // 拖拽移动
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasMoved = true;
    }
    btn.style.left = startLeft + dx + 'px';
    btn.style.top = startTop + dy + 'px';
    btn.style.right = 'auto';
  };

  // 拖拽结束
  const handleMouseUp = () => {
    if (isDragging) {
      isDragging = false;
    }
    btn.style.cursor = 'move';
    btn.style.opacity = '1';
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  // 按钮移除时清理事件监听
  const originalRemove = btn.remove.bind(btn);
  btn.remove = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    originalRemove();
  };

  document.body.appendChild(btn);
}

// ============================================
// 初始化和暴露
// ============================================

if (typeof window !== 'undefined') {
  // 拦截 console
  interceptConsole();

  // 暴露 API 到全局
  const global = window as unknown as Record<string, unknown>;
  global.__dlDebugLogs = debugLogs;
  global.__getDebugLogs = getDebugLogs;
  global.__exportDebugLogs = exportLogsAsText;
  global.__clearDebugLogs = clearLogs;
  global.__restoreConsole = restoreConsole;

  // 页面加载后显示可拖拽按钮
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createDraggableCopyButton, { once: true });
  } else {
    createDraggableCopyButton();
  }
}

export { getDebugLogs, exportLogsAsText, clearLogs, restoreConsole };
