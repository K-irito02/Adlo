import type { FileOutlineItem } from '@ai-digital-life/kernel';

export interface OutlineDraft {
  label: string;
  kind: FileOutlineItem['kind'];
  line: number;
  depth: number;
}

export type OutlineFamily =
  | 'markdown'
  | 'brace'
  | 'brace-config'
  | 'python'
  | 'yaml'
  | 'config'
  | 'json'
  | 'html'
  | 'css'
  | 'vue'
  | 'shell'
  | 'powershell'
  | 'sql'
  | 'none';

export const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export const STRUCTURAL_HTML_TAGS = new Set([
  'html',
  'head',
  'body',
  'main',
  'header',
  'footer',
  'section',
  'article',
  'aside',
  'nav',
  'details',
  'summary',
  'dialog',
  'form',
  'fieldset',
  'div',
  'template',
  'script',
  'style',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'svg',
  'g',
  'path',
  'symbol',
  'defs',
  'slot',
  'component',
]);

export const BLOCK_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'while',
  'switch',
  'case',
  'catch',
  'try',
  'finally',
  'match',
  'do',
  'with',
  'except',
  'elif',
  'foreach',
]);
