/**
 * 「关于」组的对外事实常量。
 *
 * 只放**可核验的事实**：链接、版权、许可全文。展示文案走 i18n；
 * 这里的许可正文是 MIT 的标准英文原文（不翻译、不改写，法律文本以原文为准）。
 */

export const ABOUT_URLS = {
  website: 'https://www.xiaogans.online/',
  repository: 'https://github.com/K-irito02/Adlo',
  issues: 'https://github.com/K-irito02/Adlo/issues',
} as const;

/**
 * 与仓库根 `LICENSE` 必须逐字一致。
 * 改动任一处时同步另一处；`RELEASE-CHECKLIST.md` 含该项复核。
 */
export const MIT_LICENSE_TEXT = `MIT License

Copyright (c) 2026 K-irito02

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
