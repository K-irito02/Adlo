export const testLogs: Array<{
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
}> = [];

export function logTestMessage(message: string, data?: Record<string, unknown>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    data,
  };
  testLogs.push(logEntry);
  console.log(message, data);
  
  // 保存到 localStorage 以便持久化
  try {
    localStorage.setItem('terminal-test-logs', JSON.stringify(testLogs));
  } catch {
    /* ignore */
  }
}

export function getTestLogs(): Array<{
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
}> {
  try {
    const stored = localStorage.getItem('terminal-test-logs');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    /* ignore */
  }
  return testLogs;
}

export function clearTestLogs(): void {
  testLogs.length = 0;
  try {
    localStorage.removeItem('terminal-test-logs');
  } catch {
    /* ignore */
  }
}