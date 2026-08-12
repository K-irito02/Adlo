export type ErrorToastLevel = 'error' | 'warning' | 'info';

/** error code → 默认级别（未知 code 视为 error） */
const ERROR_LEVEL_BY_CODE: Record<string, ErrorToastLevel> = {
  STORAGE_ERROR: 'error',
  MIGRATION_ERROR: 'error',
  SECURITY_ERROR: 'error',
  PATCH_ERROR: 'error',
  MODEL_ERROR: 'error',
  INTERNAL_ERROR: 'error',
  INVOKE_ERROR: 'error',
  PREVIEW_API_ERROR: 'error',
  IO_ERROR: 'error',
  CONFIG_ERROR: 'error',
  TERMINAL_ERROR: 'error',
  NETWORK_ERROR: 'error',
  NOT_FOUND: 'warning',
  INVALID_INPUT: 'warning',
  APPROVAL_REQUIRED: 'warning',
  WORKSPACE_ERROR: 'warning',
};

const NON_GIT_REPO_MARKERS = ['not a git repository', 'not a git repo'];

/** 依据 code 与 detail 解析错误 toast 提示级别 */
export function resolveErrorToastLevel(code: string, detail?: string): ErrorToastLevel {
  if (code === 'WORKSPACE_ERROR' && detail) {
    const lower = detail.toLowerCase();
    if (NON_GIT_REPO_MARKERS.some((marker) => lower.includes(marker))) {
      return 'info';
    }
  }
  return ERROR_LEVEL_BY_CODE[code] ?? 'error';
}
