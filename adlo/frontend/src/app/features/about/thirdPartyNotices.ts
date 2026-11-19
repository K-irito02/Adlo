import type { CopyKey } from '@i18n/types';

/**
 * 第三方声明：随包分发的素材与移植/改编代码。
 *
 * 锁文件能覆盖的 npm / Cargo 依赖由 `thirdPartyNotices.generated.ts` 承载
 * （`notices:generate`），这里不重复堆叠；但资产类条目（如 React Symbols）
 * 即使同时存在于依赖清单，也保留一条资产版权记录。
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

/**
 * Lucide 官方 LICENSE（2026-11-19 取自 lucide-icons/lucide）。
 * 主许可为 ISC；其中派生自 Feather 的图标另附 MIT 段，两段都必须保留。
 */
const LUCIDE_LICENSE_TEXT = `ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

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
  {
    name: 'Lucide',
    license: 'ISC',
    copyright: 'Copyright (c) 2026 Lucide Icons and Contributors',
    detailKey: 'aboutNoticeLucide',
    url: 'https://lucide.dev/',
    text: LUCIDE_LICENSE_TEXT,
  },
];
