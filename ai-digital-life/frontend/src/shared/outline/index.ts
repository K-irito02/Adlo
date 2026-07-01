import type { FileOutlineItem } from '@ai-digital-life/kernel';
import type { OutlineDraft, OutlineFamily } from './types';
import { pushMarkdownOutline } from './markdown';
import { parseBraceLanguage } from './brace';
import { parsePython } from './python';
import { parseYaml } from './yaml';
import { parseConfig } from './config';
import { parseJson } from './json';
import { parseHtml } from './html';
import { parseCss } from './css';
import { parseVue } from './vue';
import { parseShell } from './shell';
import { parseSql } from './sql';

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function fileNameOf(value: string): string {
  const normalized = normalizePath(value);
  return normalized.split('/').pop() ?? normalized;
}

function extensionOf(value: string): string {
  const fileName = fileNameOf(value).toLowerCase();
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return fileName;
  }
  return fileName.slice(dotIndex + 1);
}

function detectOutlineFamily(relativePath: string): OutlineFamily {
  const fileName = fileNameOf(relativePath).toLowerCase();
  const extension = extensionOf(relativePath);

  if (extension === 'md' || extension === 'markdown') {
    return 'markdown';
  }
  if (extension === 'py') {
    return 'python';
  }
  if (extension === 'yaml' || extension === 'yml') {
    return 'yaml';
  }
  if (extension === 'json') {
    return 'json';
  }
  if (extension === 'html' || extension === 'htm' || extension === 'xml' || extension === 'svg') {
    return 'html';
  }
  if (extension === 'css' || extension === 'scss' || extension === 'less') {
    return 'css';
  }
  if (extension === 'vue') {
    return 'vue';
  }
  if (
    extension === 'sh' ||
    extension === 'bash' ||
    extension === 'zsh' ||
    extension === 'fish' ||
    fileName === 'dockerfile'
  ) {
    return 'shell';
  }
  if (extension === 'ps1') {
    return 'powershell';
  }
  if (extension === 'sql') {
    return 'sql';
  }
  if (extension === 'toml' || extension === 'ini' || extension === 'cfg' || extension === 'conf') {
    return 'config';
  }
  if (extension === 'db' || extension === 'sqlite' || extension === 'sqlite3') {
    return 'none';
  }
  if (
    ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(extension) &&
    (fileName.includes('.config.') || fileName.endsWith('.rc.js') || fileName.endsWith('.rc.ts'))
  ) {
    return 'brace-config';
  }
  return 'brace';
}

function finalizeItems(
  drafts: OutlineDraft[],
  relativePath: string,
  totalLines: number
): FileOutlineItem[] {
  const sorted = [...drafts].sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    if (left.depth !== right.depth) {
      return left.depth - right.depth;
    }
    return left.label.localeCompare(right.label);
  });
  const normalizedPath = normalizePath(relativePath);
  const lineOccurrences = new Map<number, number>();

  return sorted.map((draft, index) => {
    let endLine = totalLines;
    for (let cursor = index + 1; cursor < sorted.length; cursor += 1) {
      if (sorted[cursor]!.depth <= draft.depth) {
        endLine = Math.max(draft.line, sorted[cursor]!.line - 1);
        break;
      }
    }

    const occurrence = lineOccurrences.get(draft.line) ?? 0;
    lineOccurrences.set(draft.line, occurrence + 1);
    const id =
      occurrence === 0
        ? `${normalizedPath}:${draft.line}`
        : `${normalizedPath}:${draft.line}:${occurrence + 1}`;

    return {
      id,
      label: draft.label,
      kind: draft.kind,
      line: draft.line,
      depth: draft.depth,
      endLine,
    };
  });
}

export function buildOutlineFromContent(content: string, relativePath: string): FileOutlineItem[] {
  const family = detectOutlineFamily(relativePath);
  const totalLines = Math.max(1, content.split(/\r?\n/).length);

  const drafts =
    family === 'markdown'
      ? pushMarkdownOutline(content)
      : family === 'brace-config'
        ? parseBraceLanguage(content, {
            includeObjectProperties: true,
            includeScalarObjectProperties: true,
          })
        : family === 'python'
          ? parsePython(content)
          : family === 'yaml'
            ? parseYaml(content)
            : family === 'config'
              ? parseConfig(content)
              : family === 'json'
                ? parseJson(content)
                : family === 'html'
                  ? parseHtml(content)
                  : family === 'css'
                    ? parseCss(content)
                    : family === 'vue'
                      ? parseVue(content)
                      : family === 'shell'
                        ? parseShell(content, 'shell')
                        : family === 'powershell'
                          ? parseShell(content, 'powershell')
                          : family === 'sql'
                            ? parseSql(content)
                            : family === 'brace'
                              ? parseBraceLanguage(content)
                              : [];

  return finalizeItems(drafts, relativePath, totalLines);
}
