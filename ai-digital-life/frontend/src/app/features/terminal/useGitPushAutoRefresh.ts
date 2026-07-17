/**
 * Git Push 自动刷新 Hook
 * 监听终端输出，检测 git push 完成并自动刷新 CI 状态
 */
import { useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { PtyOutputEvent } from '@shared/ipc/pty';

/** Git push 成功的多种输出模式 */
const PUSH_SUCCESS_PATTERNS = [
  /Everything up-to-date/i,
  /\[(remote|master|main)\s+\]/,
  /push\s+.*to\s+`[^`]+`/i,
  /branch\s+.*set\s+up\s+to/i,
  /remote:\s+.*push/i,
  /writing\s+objects/i,
  /total\s+\d+/i,
];

/** Buffer 最大容量（10KB），超过后只保留最近的内容，避免内存泄漏 */
const MAX_BUFFER_SIZE = 10 * 1024;
/** 截断后保留的长度（5KB）——确保保留最近的终端输出用于模式匹配 */
const TRUNCATE_SIZE = 5 * 1024;

export function useGitPushAutoRefresh() {
  const notifyGitPushed = useAppStore((s) => s.notifyGitPushed);

  useEffect(() => {
    if (!window.digitalLife?.subscribePtyOutput) {
      return;
    }

    // Buffer to accumulate output and detect command completion
    let buffer = '';

    const unsubscribe = window.digitalLife.subscribePtyOutput((event: PtyOutputEvent) => {
      buffer += event.data;

      // 限制 buffer 大小——在匹配模式之前先检查和截断，避免单次事件导致 buffer 过大
      if (buffer.length > MAX_BUFFER_SIZE) {
        buffer = buffer.slice(-TRUNCATE_SIZE);
      }

      // Detect git push command execution
      // Look for git push being typed and then success output appearing
      const hasGitPush = /\bgit\s+push\b/i.test(buffer);
      const hasSuccess = PUSH_SUCCESS_PATTERNS.some((pattern) => pattern.test(buffer));

      if (hasGitPush && hasSuccess) {
        // Reset buffer after detection
        buffer = '';
        // Trigger CI refresh
        notifyGitPushed();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [notifyGitPushed]);
}
