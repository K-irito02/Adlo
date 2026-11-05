import type { CopyKey } from '@i18n/types';

/**
 * 第三方声明（当前已知范围）。
 *
 * 这里只收录**随包分发的素材与移植/改编代码**的许可与版权行；
 * 全部 npm / Cargo 依赖清单与许可全文是发布前的生成任务（见 RELEASE-CHECKLIST.md）。
 * 版权行必须与上游许可文件一致；上游未提供时保持为空，不自行编造。
 */

function mitLicenseText(copyright?: string): string {
  const notice = copyright ? `${copyright}\n\n` : '';
  return `MIT License

${notice}Permission is hereby granted, free of charge, to any person obtaining a copy
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
}

export interface ThirdPartyNotice {
  name: string;
  license: string;
  copyright?: string;
  detailKey: CopyKey;
  url: string;
  text: string;
}

export const THIRD_PARTY_NOTICES: ThirdPartyNotice[] = [
  {
    name: 'bklit-ui',
    license: 'MIT',
    copyright: 'Copyright (c) 2026 uixmat',
    detailKey: 'aboutNoticeBklit',
    url: 'https://github.com/bklit/bklit-ui',
    text: mitLicenseText('Copyright (c) 2026 uixmat'),
  },
  {
    name: 'React Symbols',
    license: 'MIT',
    copyright: 'Copyright (c) 2022 Pablo Hernández',
    detailKey: 'aboutNoticeReactSymbols',
    url: 'https://github.com/pheralb/react-symbols',
    text: mitLicenseText('Copyright (c) 2022 Pablo Hernández'),
  },
  {
    name: 'Untitled UI',
    license: 'MIT',
    copyright: 'Copyright (c) 2025 Untitled UI',
    detailKey: 'aboutNoticeUntitledUi',
    url: 'https://github.com/untitleduico/react',
    text: mitLicenseText('Copyright (c) 2025 Untitled UI'),
  },
  {
    name: 'Devicons',
    license: 'MIT',
    detailKey: 'aboutNoticeDevicons',
    url: 'https://github.com/vorillaz/devicons',
    // 上游 LICENSE 未提供版权行；按原文保留，不补造。
    text: mitLicenseText(),
  },
];
