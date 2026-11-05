import type { CopyKey } from '@i18n/types';

export interface CreditItem {
  name: string;
  detailKey: CopyKey;
  /** 许可证短名；只写已核实的结果，完整文本见「第三方声明」。 */
  license?: string;
  /** 项目主页/来源；有值时名称可点击打开。 */
  url?: string;
}

export interface CreditGroup {
  titleKey: CopyKey;
  items: CreditItem[];
}

/**
 * 「致谢」的分组与条目（人工维护）。
 *
 * 只列**真实使用**的字体、图标素材、图表、编辑器/预览、框架与外部工具；
 * 许可证短名必须是已核实值（完整许可文本在第三方声明）。全量依赖清单由发布前
 * 的生成任务负责，不在这里手工堆叠。
 */
export const CREDIT_GROUPS: CreditGroup[] = [
  {
    titleKey: 'aboutCreditsFonts',
    items: [
      {
        name: 'Inter',
        detailKey: 'aboutCreditsInter',
        license: 'SIL OFL 1.1',
        url: 'https://rsms.me/inter/',
      },
      {
        name: 'JetBrains Mono',
        detailKey: 'aboutCreditsJetbrains',
        license: 'SIL OFL 1.1',
        url: 'https://www.jetbrains.com/lp/mono/',
      },
    ],
  },
  {
    titleKey: 'aboutCreditsAssets',
    items: [
      {
        name: 'React Symbols',
        detailKey: 'aboutCreditsReactSymbols',
        license: 'MIT',
        url: 'https://react-symbols.pheralb.dev/',
      },
      {
        name: 'Untitled UI',
        detailKey: 'aboutCreditsUntitledUi',
        license: 'MIT',
        url: 'https://www.untitledui.com/resources/file-icons',
      },
      {
        name: 'Devicons',
        detailKey: 'aboutCreditsDevicons',
        license: 'MIT',
        url: 'https://devicons.io/icons/',
      },
      {
        name: 'Lucide',
        detailKey: 'aboutCreditsLucide',
        license: 'MIT',
        url: 'https://lucide.dev/',
      },
      {
        name: 'react-file-icon',
        detailKey: 'aboutCreditsReactFileIcon',
        license: 'MIT',
        url: 'https://github.com/catamphetamine/react-file-icon',
      },
    ],
  },
  {
    titleKey: 'aboutCreditsCharts',
    items: [
      {
        name: 'bklit-ui',
        detailKey: 'aboutCreditsBklit',
        license: 'MIT',
        url: 'https://github.com/bklit/bklit-ui',
      },
      {
        name: 'visx',
        detailKey: 'aboutCreditsVisx',
        license: 'MIT',
        url: 'https://airbnb.io/visx/',
      },
      {
        name: 'D3',
        detailKey: 'aboutCreditsD3',
        license: 'ISC',
        url: 'https://d3js.org/',
      },
    ],
  },
  {
    titleKey: 'aboutCreditsEditors',
    items: [
      {
        name: 'CodeMirror',
        detailKey: 'aboutCreditsCodemirror',
        license: 'MIT',
        url: 'https://codemirror.net/',
      },
      {
        name: 'xterm.js',
        detailKey: 'aboutCreditsXterm',
        license: 'MIT',
        url: 'https://xtermjs.org/',
      },
      {
        name: 'markdown-it',
        detailKey: 'aboutCreditsMarkdownIt',
        license: 'MIT',
        url: 'https://github.com/markdown-it/markdown-it',
      },
      {
        name: 'Starry Night',
        detailKey: 'aboutCreditsStarryNight',
        license: 'MIT',
        url: 'https://github.com/wooorm/starry-night',
      },
      {
        name: 'PDF.js',
        detailKey: 'aboutCreditsPdfjs',
        license: 'Apache-2.0',
        url: 'https://mozilla.github.io/pdf.js/',
      },
      {
        name: 'docx-preview',
        detailKey: 'aboutCreditsDocx',
        license: 'Apache-2.0',
        url: 'https://github.com/VolodymyrBaydalka/docxjs',
      },
      {
        name: 'pptx-preview',
        detailKey: 'aboutCreditsPptx',
        license: 'ISC',
        url: 'https://github.com/pipipi-pikachu/pptx-preview',
      },
      {
        name: 'SheetJS',
        detailKey: 'aboutCreditsSheetjs',
        license: 'Apache-2.0',
        url: 'https://sheetjs.com/',
      },
      {
        name: 'DOMPurify',
        detailKey: 'aboutCreditsDompurify',
        license: 'MPL-2.0 / Apache-2.0',
        url: 'https://github.com/cure53/DOMPurify',
      },
      {
        name: 'github-markdown-css',
        detailKey: 'aboutCreditsGithubMarkdownCss',
        license: 'MIT',
        url: 'https://github.com/sindresorhus/github-markdown-css',
      },
    ],
  },
  {
    titleKey: 'aboutCreditsFramework',
    items: [
      {
        name: 'Tauri',
        detailKey: 'aboutCreditsTauri',
        license: 'Apache-2.0 / MIT',
        url: 'https://tauri.app/',
      },
      {
        name: 'React',
        detailKey: 'aboutCreditsReact',
        license: 'MIT',
        url: 'https://react.dev/',
      },
      {
        name: 'Vite',
        detailKey: 'aboutCreditsVite',
        license: 'MIT',
        url: 'https://vite.dev/',
      },
      {
        name: 'Zustand',
        detailKey: 'aboutCreditsZustand',
        license: 'MIT',
        url: 'https://zustand.docs.pmnd.rs/',
      },
      {
        name: 'Radix UI',
        detailKey: 'aboutCreditsRadix',
        license: 'MIT',
        url: 'https://www.radix-ui.com/',
      },
      {
        name: 'dnd-kit',
        detailKey: 'aboutCreditsDndkit',
        license: 'MIT',
        url: 'https://dndkit.com/',
      },
      {
        name: 'Motion',
        detailKey: 'aboutCreditsMotion',
        license: 'MIT',
        url: 'https://motion.dev/',
      },
      {
        name: 'Tailwind CSS',
        detailKey: 'aboutCreditsTailwind',
        license: 'MIT',
        url: 'https://tailwindcss.com/',
      },
    ],
  },
  {
    titleKey: 'aboutCreditsTools',
    items: [
      {
        name: 'DSH',
        detailKey: 'aboutCreditsDsh',
        url: 'https://github.com/deepseek-ai/deepseek-harness',
      },
      {
        name: 'OpenCode CLI',
        detailKey: 'aboutCreditsOpencode',
        url: 'https://github.com/anomalyco/opencode',
      },
    ],
  },
];
