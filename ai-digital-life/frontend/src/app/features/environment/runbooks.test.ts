import { describe, it, expect } from 'vitest';
import { RUNBOOKS, RUNBOOK_KEYS } from './runbooks';

/** 五段固定标题（顺序即 runbook 的阅读顺序，缺一段即视为结构破损）。 */
const REQUIRED_SECTIONS = [
  '## 症状',
  '## 检测命令',
  '## 安装步骤',
  '## 装后回填',
  '## 回滚',
] as const;

/** 禁止出现在 runbook 里的内容：凭据样式、个人目录、本机地址。 */
const FORBIDDEN = ['sk-', 'ghp_', 'C:\\Users\\', 'localhost:'] as const;

describe('env runbooks', () => {
  it('六份 runbook 全部登记', () => {
    expect(RUNBOOK_KEYS).toHaveLength(6);
  });

  it.each(RUNBOOK_KEYS)('%s 非空且包含五段固定标题', (key) => {
    const text = RUNBOOKS[key];
    expect(text.trim().length).toBeGreaterThan(0);
    for (const heading of REQUIRED_SECTIONS) {
      expect(text).toContain(heading);
    }
  });

  it.each(RUNBOOK_KEYS)('%s 不含凭据/个人路径/本机地址', (key) => {
    const text = RUNBOOKS[key];
    for (const bad of FORBIDDEN) {
      expect(text).not.toContain(bad);
    }
  });
});
