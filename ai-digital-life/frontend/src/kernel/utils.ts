import { APP_STATE_SCHEMA_VERSION } from './constants';
import type { WindowState, AppStateV1 } from './types';

export function defaultWindowState(): WindowState {
  return {
    width: 1280,
    height: 800,
    isMaximized: false,
  };
}

export function defaultAppState(): AppStateV1 {
  return {
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    recentWorkspaces: [],
    windowState: defaultWindowState(),
  };
}

export function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function isChildPath(parentPath: string, childPath: string): boolean {
  const normParent = normalizePath(parentPath).replace(/\/$/, '') + '/';
  const normChild = normalizePath(childPath);
  return normChild.startsWith(normParent) && normChild !== normParent;
}

export function createWorkspaceId(workspacePath: string): string {
  const normalized = normalizePath(workspacePath);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function createId(prefix?: string): string {
  const id = globalThis.crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function sanitizeSensitiveData<T>(value: T): T {
  const sensitiveKeys = ['token', 'apiKey', 'password', 'authorization', 'secret'];

  function walk(input: unknown): unknown {
    if (Array.isArray(input)) {
      return input.map((item) => walk(item));
    }

    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([key, childValue]) => {
          if (
            sensitiveKeys.some((candidate) => key.toLowerCase().includes(candidate.toLowerCase()))
          ) {
            return [key, '[REDACTED]'];
          }

          return [key, walk(childValue)];
        })
      );
    }

    return input;
  }

  return walk(value) as T;
}
