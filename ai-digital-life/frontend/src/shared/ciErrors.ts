/**
 * CI 错误码常量与解析工具
 *
 * 将 ciSlice/githubSlice/githubRepoSlice 中硬编码的中文错误消息替换为结构化错误码，
 * 由消费端通过 i18n key 翻译为当前语言文本。
 */

export const CI_ERROR_CODES = {
  CONFIG_MISSING_REPO: 'CI_CONFIG_MISSING_REPO',
  FETCH_STATUS_FAILED: 'CI_FETCH_STATUS_FAILED',
  DEFAULT_FOLDER_NAME: 'CI_DEFAULT_FOLDER_NAME',
} as const;

const DEFAULT_FOLDER_PREFIX = `${CI_ERROR_CODES.DEFAULT_FOLDER_NAME}:`;

/**
 * 将 ciError 状态值翻译为展示文本。
 *
 * - 已知错误码 → 返回对应的 i18n 文本
 * - 其他字符串（如后端返回的原始 message）→ 原样返回
 * - null → 返回 null
 */
export function resolveCiErrorMessage(
  message: string | null,
  t: Record<string, string>,
): string | null {
  if (!message) {
    return null;
  }
  switch (message) {
    case CI_ERROR_CODES.CONFIG_MISSING_REPO:
      return t.ciConfigMissingRepo;
    case CI_ERROR_CODES.FETCH_STATUS_FAILED:
      return t.ciFetchStatusFailed;
    default:
      return message;
  }
}

/**
 * 解析文件夹名称：如果是默认文件夹占位符（`CI_DEFAULT_FOLDER_NAME:{index}`），
 * 则替换为 i18n 文本；否则原样返回。
 */
export function resolveCiFolderName(name: string, t: Record<string, string>): string {
  if (name.startsWith(DEFAULT_FOLDER_PREFIX)) {
    const index = name.slice(DEFAULT_FOLDER_PREFIX.length);
    // Fallback uses neutral placeholder (reconstructs original name) to expose missing i18n key
    // without hardcoding any natural-language text.
    return (t.ciDefaultFolderName ?? `${DEFAULT_FOLDER_PREFIX}{index}`).replace('{index}', index);
  }
  return name;
}
