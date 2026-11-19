// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aboutEn } from '../app/i18n/en-US/about';
import { aboutZh } from '../app/i18n/zh-CN/about';
import { ruleBody } from './testing/cssRules';

/**
 * 「关于」组链接区的两条布局事实（用户 2026-11-19 指定）：
 * - 仓库入口（GitHub / Gitee）同一行；
 * -「问题反馈」独占下一行且水平居中。
 *
 * 结构守卫在 `AboutSettings.test.tsx`（断言两行包裹与按钮归属）；本文件钉 CSS 声明，
 * 并直接断言中英真实字典的文案值（去「仓库」后缀），二者一起构成回归保护
 * （真实级联另由 getComputedStyle 取证）。
 */
const css = readFileSync(join(process.cwd(), 'src/styles/regions/about-settings.css'), 'utf-8');

describe('about settings link layout', () => {
  it('keeps the links block as a column so the issue tracker owns its own line', () => {
    const body = ruleBody(css, '.adl-about__links');
    expect(body).toBeTruthy();
    expect(body).toMatch(/flex-direction:\s*column/);
  });

  it('renders the repository links as one centered row', () => {
    const body = ruleBody(css, '.adl-about__links-row');
    expect(body).toBeTruthy();
    // 默认 flex 方向即 row；显式声明 column 会让 GitHub/Gitee 各占一行。
    expect(body).toMatch(/display:\s*flex/);
    expect(body).not.toMatch(/flex-direction:\s*column/);
    // 单个按钮的「问题反馈」行靠 justify-content 居中于链接块。
    expect(body).toMatch(/justify-content:\s*center/);
  });

  it('keeps the repository labels free of the "仓库/repository" suffix', () => {
    expect(aboutZh.aboutRepository).toBe('GitHub');
    expect(aboutZh.aboutGiteeRepository).toBe('Gitee');
    expect(aboutEn.aboutRepository).toBe('GitHub');
    expect(aboutEn.aboutGiteeRepository).toBe('Gitee');
  });
});
