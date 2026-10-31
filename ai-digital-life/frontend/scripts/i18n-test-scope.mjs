/**
 * i18n 字典变更 → 受影响测试目录（启发式收窄）。
 *
 * 背景：i18n 字典被几乎所有组件引用，`vitest related` 会把整个前端的导入图拉进来
 * （一次字典改动 = 150+ 文件 / 1600+ 用例 / 2 分钟）。按「字典域 ↔ 功能目录」映射
 * 可以把常见的文案改动收窄到相关功能。
 *
 * 安全边界：只处理**已知**字典文件，且变更文件必须全部是 i18n 字典才启用；
 * 任何未知字典返回 null，调用方回退到 `vitest related`（宁可多跑）。
 */

/** 变更文件 → 测试目录（相对 frontend/）。 */
const DOMAIN_SCOPES = {
  'src/app/i18n/zh-CN/dsh.ts': ['src/app/features/dsh', 'src/app/features/harness'],
  'src/app/i18n/en-US/dsh.ts': ['src/app/features/dsh', 'src/app/features/harness'],
  'src/app/i18n/zh-CN/opencode.ts': ['src/app/features/opencode', 'src/app/features/harness'],
  'src/app/i18n/en-US/opencode.ts': ['src/app/features/opencode', 'src/app/features/harness'],
  'src/app/i18n/zh-CN/harnessVersion.ts': [
    'src/app/features/harness',
    'src/app/features/dsh',
    'src/app/features/opencode',
  ],
  'src/app/i18n/en-US/harnessVersion.ts': [
    'src/app/features/harness',
    'src/app/features/dsh',
    'src/app/features/opencode',
  ],
};

/** 设置面板会消费上述所有字典的文案，始终随跑。 */
const ALWAYS = ['src/app/i18n/__tests__', 'src/app/components/settings'];

/**
 * @param {string[]} files 变更的源码文件（相对 frontend/）
 * @returns {string[] | null} 测试目录；null 表示不适用（调用方回退 related）
 */
export function i18nTestScopes(files) {
  if (files.length === 0) {
    return null;
  }
  const dirs = new Set(ALWAYS);
  for (const file of files) {
    const scopes = DOMAIN_SCOPES[file];
    if (!scopes) {
      return null;
    }
    for (const scope of scopes) {
      dirs.add(scope);
    }
  }
  return [...dirs].sort();
}
