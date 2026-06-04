import type { FileOutlineItem } from '@ai-digital-life/kernel';

type OutlineDraft = {
  label: string;
  kind: FileOutlineItem['kind'];
  line: number;
  depth: number;
};

type OutlineFamily =
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

const VOID_HTML_TAGS = new Set([
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

const STRUCTURAL_HTML_TAGS = new Set([
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

const BLOCK_KEYWORDS = new Set([
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

  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (extension === 'py') return 'python';
  if (extension === 'yaml' || extension === 'yml') return 'yaml';
  if (extension === 'json') return 'json';
  if (extension === 'html' || extension === 'htm' || extension === 'xml' || extension === 'svg')
    return 'html';
  if (extension === 'css' || extension === 'scss' || extension === 'less') return 'css';
  if (extension === 'vue') return 'vue';
  if (
    extension === 'sh' ||
    extension === 'bash' ||
    extension === 'zsh' ||
    extension === 'fish' ||
    fileName === 'dockerfile'
  )
    return 'shell';
  if (extension === 'ps1') return 'powershell';
  if (extension === 'sql') return 'sql';
  if (extension === 'toml' || extension === 'ini' || extension === 'cfg' || extension === 'conf')
    return 'config';
  if (extension === 'db' || extension === 'sqlite' || extension === 'sqlite3') return 'none';
  if (
    ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(extension) &&
    (fileName.includes('.config.') || fileName.endsWith('.rc.js') || fileName.endsWith('.rc.ts'))
  ) {
    return 'brace-config';
  }
  return 'brace';
}

function cleanMarkdownHeadingLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+#+\s*$/, '')
    .trim();
}

function finalizeItems(
  drafts: OutlineDraft[],
  relativePath: string,
  totalLines: number
): FileOutlineItem[] {
  const sorted = [...drafts].sort((left, right) => {
    if (left.line !== right.line) return left.line - right.line;
    if (left.depth !== right.depth) return left.depth - right.depth;
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

function stripQuotedText(value: string): string {
  return value
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

function sanitizeBraceLine(lineText: string): string {
  return stripQuotedText(lineText)
    .replace(/\/\/.*$/g, '')
    .replace(/\/\*.*?\*\//g, '');
}

function countLeadingClosers(value: string, closers: string): number {
  let count = 0;
  for (const char of value.trimStart()) {
    if (!closers.includes(char)) break;
    count += 1;
  }
  return count;
}

function countChars(value: string, chars: string): number {
  let count = 0;
  for (const char of value) {
    if (chars.includes(char)) count += 1;
  }
  return count;
}

function pushMarkdownOutline(content: string): OutlineDraft[] {
  let inFence = false;

  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trimStart();
    if (!trimmed) return [];

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      return [];
    }

    if (!inFence && trimmed.startsWith('#')) {
      const hashes = trimmed.match(/^#{1,6}/)?.[0] ?? '';
      if (!hashes || trimmed[hashes.length]?.trim() !== '') {
        return [];
      }
      const label = cleanMarkdownHeadingLabel(trimmed.slice(hashes.length));
      if (!label) return [];
      return [{ label, kind: 'heading', line, depth: hashes.length }];
    }

    return [];
  });
}

function buildBraceMatchers() {
  return [
    {
      kind: 'class' as const,
      pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
    },
    { kind: 'interface' as const, pattern: /^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
    { kind: 'type' as const, pattern: /^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/ },
    { kind: 'enum' as const, pattern: /^(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/ },
    {
      kind: 'function' as const,
      pattern: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
    },
    {
      kind: 'const' as const,
      pattern:
        /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|\[|async\b|function\b|\(?[\w\s,]*\)?\s*=>)/,
    },
    {
      kind: 'variable' as const,
      pattern:
        /^(?:export\s+)?(?:let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|\[|async\b|function\b|\(?[\w\s,]*\)?\s*=>)/,
    },
    { kind: 'function' as const, pattern: /^(?:pub\s+)?fn\s+([A-Za-z_][\w]*)/ },
    { kind: 'class' as const, pattern: /^(?:pub\s+)?struct\s+([A-Za-z_][\w]*)/ },
    { kind: 'enum' as const, pattern: /^(?:pub\s+)?enum\s+([A-Za-z_][\w]*)/ },
    { kind: 'interface' as const, pattern: /^(?:pub\s+)?trait\s+([A-Za-z_][\w]*)/ },
    { kind: 'heading' as const, pattern: /^(?:pub\s+)?impl(?:<[^>]+>)?\s+([A-Za-z_][\w:]*)/ },
    { kind: 'type' as const, pattern: /^(?:pub\s+)?type\s+([A-Za-z_][\w]*)/ },
    { kind: 'const' as const, pattern: /^(?:pub\s+)?const\s+([A-Za-z_][\w]*)/ },
    { kind: 'function' as const, pattern: /^func(?:\s*\([^)]*\))?\s+([A-Za-z_][\w]*)/ },
    { kind: 'class' as const, pattern: /^type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)\b/ },
    {
      kind: 'class' as const,
      pattern:
        /^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*class\s+([A-Za-z_][\w]*)/i,
    },
    {
      kind: 'interface' as const,
      pattern:
        /^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*interface\s+([A-Za-z_][\w]*)/i,
    },
    {
      kind: 'enum' as const,
      pattern:
        /^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*enum\s+([A-Za-z_][\w]*)/i,
    },
    {
      kind: 'class' as const,
      pattern:
        /^(?:public|private|protected|internal|abstract|sealed|static|partial|final|\s)*record\s+([A-Za-z_][\w]*)/i,
    },
    {
      kind: 'heading' as const,
      pattern: /^(?:public|private|protected|internal|\s)*namespace\s+([A-Za-z_][\w.]*)/i,
    },
    {
      kind: 'class' as const,
      pattern: /^(?:template\s*<[^>]+>\s*)?(?:class|struct)\s+([A-Za-z_~][\w:]*)/,
    },
    { kind: 'enum' as const, pattern: /^enum\s+(?:class\s+)?([A-Za-z_][\w]*)/ },
    { kind: 'heading' as const, pattern: /^(?:module|mod)\s+([A-Za-z_][\w]*)/ },
    {
      kind: 'method' as const,
      pattern:
        /^(?:public|private|protected|internal|static|async|virtual|override|abstract|readonly|get|set|\s)+([A-Za-z_$][\w$]*)\s*\([^;=]*\)\s*(?::[^{=]+)?\s*(?:\{|=>)/,
    },
    {
      kind: 'property' as const,
      pattern:
        /^(?:public|private|protected|internal|readonly|static|\s)+([A-Za-z_$][\w$]*)\s*[:=]/,
    },
    {
      kind: 'function' as const,
      pattern: /^(?:[\w:<>,~*&\[\]\s]+)\s+([A-Za-z_~][\w:]*)\s*\([^;]*\)\s*(?:const\b)?\s*(?:\{|$)/,
    },
  ];
}

const BRACE_MATCHERS = buildBraceMatchers();

function parseObjectPropertyLabel(
  trimmed: string,
  options?: { includeScalarValues?: boolean }
): string | undefined {
  const keyMatch = trimmed.match(
    /^(?:readonly\s+)?(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$-]*))\s*:\s*(.*)$/
  );
  if (!keyMatch) {
    return undefined;
  }
  const value = keyMatch[3]?.trim() ?? '';
  if (
    !value ||
    value.startsWith('{') ||
    value.startsWith('[') ||
    value.startsWith('new ') ||
    value.startsWith('async ') ||
    value.startsWith('function') ||
    value.startsWith('(') ||
    value.startsWith('<')
  ) {
    return (keyMatch[1] || keyMatch[2])?.trim();
  }
  if (options?.includeScalarValues) {
    return (keyMatch[1] || keyMatch[2])?.trim();
  }
  return undefined;
}

function parseBraceLanguage(
  content: string,
  options?: { includeObjectProperties?: boolean; includeScalarObjectProperties?: boolean }
): OutlineDraft[] {
  let braceDepth = 0;
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return [];

    const sanitized = sanitizeBraceLine(lineText);
    const effectiveBraceDepth = Math.max(0, braceDepth - countLeadingClosers(sanitized, '}]'));
    const items: OutlineDraft[] = [];

    for (const matcher of BRACE_MATCHERS) {
      const match = trimmed.match(matcher.pattern);
      const label = match?.[1]?.trim();
      if (!label) continue;
      if (matcher.kind === 'function' || matcher.kind === 'method') {
        const keyword = label.split('::').pop()?.toLowerCase() ?? '';
        if (BLOCK_KEYWORDS.has(keyword)) continue;
      }
      if (
        (matcher.kind === 'function' || matcher.kind === 'method') &&
        trimmed.endsWith(';') &&
        !trimmed.includes('{')
      ) {
        continue;
      }
      items.push({
        label,
        kind: matcher.kind,
        line,
        depth: effectiveBraceDepth + 1,
      });
      break;
    }

    if (items.length === 0 && options?.includeObjectProperties) {
      const propertyLabel = parseObjectPropertyLabel(trimmed, {
        includeScalarValues: options.includeScalarObjectProperties,
      });
      if (propertyLabel) {
        items.push({
          label: propertyLabel,
          kind: 'heading',
          line,
          depth: options.includeScalarObjectProperties
            ? Math.max(1, effectiveBraceDepth)
            : effectiveBraceDepth + 1,
        });
      }
    }

    braceDepth = Math.max(
      0,
      braceDepth + countChars(sanitized, '{[') - countChars(sanitized, '}]')
    );
    return items;
  });
}

function parsePython(content: string): OutlineDraft[] {
  const indentStack: number[] = [];
  const drafts: OutlineDraft[] = [];
  content.split(/\r?\n/).forEach((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const indent = lineText.match(/^\s*/)?.[0]?.replace(/\t/g, '    ').length ?? 0;
    while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]!) {
      indentStack.pop();
    }

    const classMatch = trimmed.match(/^class\s+([A-Za-z_][\w]*)/);
    if (classMatch?.[1]) {
      indentStack.push(indent);
      drafts.push({ label: classMatch[1], kind: 'class', line, depth: indentStack.length });
      return;
    }

    const functionMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][\w]*)/);
    if (functionMatch?.[1]) {
      indentStack.push(indent);
      drafts.push({ label: functionMatch[1], kind: 'function', line, depth: indentStack.length });
    }
  });
  return drafts;
}

function parseYaml(content: string): OutlineDraft[] {
  const indentStack: number[] = [];
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#')) return [];
    const indent = lineText.match(/^\s*/)?.[0]?.replace(/\t/g, '  ').length ?? 0;
    while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]!) {
      indentStack.pop();
    }

    const listKeyMatch = trimmed.match(/^-+\s*([^:#]+)\s*:\s*(.*)$/);
    if (listKeyMatch?.[1]) {
      indentStack.push(indent);
      return [
        {
          label: listKeyMatch[1].trim(),
          kind: 'heading',
          line,
          depth: indentStack.length,
        },
      ];
    }

    const keyMatch = trimmed.match(/^([^:#][^:]*?)\s*:\s*(.*)$/);
    if (keyMatch?.[1]) {
      const suffix = keyMatch[2]?.trim() ?? '';
      if (
        suffix &&
        !['|', '>'].includes(suffix) &&
        !suffix.startsWith('{') &&
        !suffix.startsWith('[')
      ) {
        return [];
      }
      indentStack.push(indent);
      return [
        {
          label: keyMatch[1].trim().replace(/^['"]|['"]$/g, ''),
          kind: 'heading',
          line,
          depth: indentStack.length,
        },
      ];
    }

    if (/^-+\s*(?:\{|\[)?\s*$/.test(trimmed)) {
      indentStack.push(indent);
      return [
        {
          label: 'item',
          kind: 'heading',
          line,
          depth: indentStack.length,
        },
      ];
    }

    return [];
  });
}

function parseConfig(content: string): OutlineDraft[] {
  const sectionDepths = new Map<string, number>();
  let currentSectionDepth = 0;
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return [];

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch?.[1]) {
      const parts = sectionMatch[1]
        .split('.')
        .map((part) => part.trim())
        .filter(Boolean);
      currentSectionDepth = parts.length || 1;
      sectionDepths.set(sectionMatch[1], currentSectionDepth);
      return [
        {
          label: sectionMatch[1].trim(),
          kind: 'heading',
          line,
          depth: currentSectionDepth,
        },
      ];
    }

    const entryMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (entryMatch?.[1]) {
      const value = entryMatch[2].trim();
      if (!value.startsWith('{') && !value.startsWith('[') && value !== '') {
        return [];
      }
      return [
        {
          label: entryMatch[1],
          kind: 'heading',
          line,
          depth: currentSectionDepth + 1,
        },
      ];
    }

    return [];
  });
}

function parseJson(content: string): OutlineDraft[] {
  let braceDepth = 0;
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed) return [];
    const sanitized = stripQuotedText(lineText);
    const effectiveDepth = Math.max(0, braceDepth - countLeadingClosers(sanitized, '}]'));
    const keyMatch = trimmed.match(/^"([^"]+)"\s*:\s*(.*)$/);
    const items: OutlineDraft[] = [];
    if (keyMatch?.[1]) {
      const value = keyMatch[2].trim();
      if (!value || value.startsWith('{') || value.startsWith('[')) {
        items.push({
          label: keyMatch[1],
          kind: 'heading',
          line,
          depth: effectiveDepth + 1,
        });
      }
    }
    braceDepth = Math.max(
      0,
      braceDepth + countChars(sanitized, '{[') - countChars(sanitized, '}]')
    );
    return items;
  });
}

function formatHtmlTagLabel(tag: string, attrs: string): string {
  const id = attrs.match(/\sid=["']([^"']+)["']/i)?.[1];
  if (id) return `${tag}#${id}`;
  const className = attrs
    .match(/\sclass=["']([^"']+)["']/i)?.[1]
    ?.split(/\s+/)
    .filter(Boolean)[0];
  if (className) return `${tag}.${className}`;
  const name = attrs.match(/\s(?:name|role)=["']([^"']+)["']/i)?.[1];
  if (name) return `${tag}[${name}]`;
  return tag;
}

function shouldOutlineHtmlTag(tag: string, attrs: string): boolean {
  return (
    STRUCTURAL_HTML_TAGS.has(tag) ||
    tag.includes('-') ||
    /\s(?:id|class|name|role)=["']/.test(attrs)
  );
}

function parseHtml(content: string): OutlineDraft[] {
  const tagStack: string[] = [];
  const items: OutlineDraft[] = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const regex = /<\/?([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      const raw = match[0];
      const tag = match[1]!.toLowerCase();
      const attrs = match[2] ?? '';
      const selfClosing = match[3] === '/' || VOID_HTML_TAGS.has(tag);
      const isClosing = raw.startsWith('</');

      if (isClosing) {
        while (tagStack.length > 0) {
          const current = tagStack.pop();
          if (current === tag) break;
        }
        continue;
      }

      if (shouldOutlineHtmlTag(tag, attrs)) {
        items.push({
          label: formatHtmlTagLabel(tag, attrs),
          kind: 'heading',
          line: index + 1,
          depth: tagStack.length + 1,
        });
      }

      if (!selfClosing) {
        tagStack.push(tag);
      }
    }
  }

  return items;
}

function parseCss(content: string): OutlineDraft[] {
  let braceDepth = 0;
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*')) return [];
    const sanitized = lineText.replace(/\/\*.*?\*\//g, '');
    const items: OutlineDraft[] = [];
    const openIndex = sanitized.indexOf('{');
    if (openIndex >= 0) {
      const label = sanitized.slice(0, openIndex).trim();
      if (label && !label.includes(':')) {
        items.push({
          label,
          kind: 'heading',
          line,
          depth: Math.max(1, braceDepth + 1),
        });
      }
    }
    braceDepth = Math.max(0, braceDepth + countChars(sanitized, '{') - countChars(sanitized, '}'));
    return items;
  });
}

function parseVue(content: string): OutlineDraft[] {
  const drafts: OutlineDraft[] = [];
  const lines = content.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    const match = line.match(/^\s*<(template|script|style)([^>]*)>/i);
    if (!match?.[1]) {
      index += 1;
      continue;
    }

    const section = match[1].toLowerCase();
    const startLine = index + 1;
    const endTag = new RegExp(`</${section}>`, 'i');
    let endIndex = index + 1;
    while (endIndex < lines.length && !endTag.test(lines[endIndex]!)) {
      endIndex += 1;
    }

    drafts.push({
      label: section,
      kind: 'heading',
      line: startLine,
      depth: 1,
    });

    const innerContent = lines.slice(index + 1, endIndex).join('\n');
    const innerDrafts =
      section === 'template'
        ? parseHtml(innerContent)
        : section === 'style'
          ? parseCss(innerContent)
          : parseBraceLanguage(innerContent, { includeObjectProperties: true });

    for (const draft of innerDrafts) {
      drafts.push({
        ...draft,
        line: draft.line + startLine,
        depth: draft.depth + 1,
      });
    }

    index = endIndex + 1;
  }

  return drafts;
}

function parseShell(content: string, family: 'shell' | 'powershell'): OutlineDraft[] {
  let depth = 0;
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#')) return [];
    const items: OutlineDraft[] = [];

    if (trimmed.startsWith('}') || /^(fi|done|esac)\b/.test(trimmed)) {
      depth = Math.max(0, depth - 1);
    }

    const functionMatch =
      family === 'powershell'
        ? trimmed.match(/^function\s+([A-Za-z_][\w-]*)/i)
        : trimmed.match(/^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{/);
    if (functionMatch?.[1]) {
      items.push({ label: functionMatch[1], kind: 'function', line, depth: depth + 1 });
    } else {
      const blockMatch =
        family === 'powershell'
          ? trimmed.match(/^(if|foreach|for|while|switch|try|catch|finally|class|enum)\b/i)
          : trimmed.match(/^(if|for|while|until|case|select)\b/);
      if (blockMatch?.[1]) {
        items.push({ label: trimmed, kind: 'heading', line, depth: depth + 1 });
      }
    }

    const opensBlock =
      family === 'powershell'
        ? trimmed.endsWith('{')
        : /\{\s*$/.test(trimmed) || /\b(do|then)\s*$/.test(trimmed) || /^case\b/.test(trimmed);
    if (opensBlock) {
      depth += 1;
    }

    return items;
  });
}

function parseSql(content: string): OutlineDraft[] {
  let insideCreateTable = false;
  const drafts: OutlineDraft[] = [];
  for (const [index, lineText] of content.split(/\r?\n/).entries()) {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;

    const createTableMatch = trimmed.match(/^create\s+table\s+([A-Za-z0-9_."]+)/i);
    if (createTableMatch?.[1]) {
      drafts.push({
        label: `table ${createTableMatch[1].replace(/"/g, '')}`,
        kind: 'type',
        line,
        depth: 1,
      });
      insideCreateTable = true;
      continue;
    }

    const createOtherMatch = trimmed.match(
      /^create\s+(view|index|function|procedure)\s+([A-Za-z0-9_."]+)/i
    );
    if (createOtherMatch?.[2]) {
      drafts.push({
        label: `${createOtherMatch[1].toLowerCase()} ${createOtherMatch[2].replace(/"/g, '')}`,
        kind: createOtherMatch[1].toLowerCase() === 'function' ? 'function' : 'heading',
        line,
        depth: 1,
      });
      insideCreateTable = false;
      continue;
    }

    const alterMatch = trimmed.match(/^alter\s+table\s+([A-Za-z0-9_."]+)/i);
    if (alterMatch?.[1]) {
      drafts.push({
        label: `alter ${alterMatch[1].replace(/"/g, '')}`,
        kind: 'heading',
        line,
        depth: 1,
      });
      insideCreateTable = false;
      continue;
    }

    if (insideCreateTable) {
      if (/^\)\s*;?$/.test(trimmed)) {
        insideCreateTable = false;
        continue;
      }
      const columnMatch = trimmed.match(/^([A-Za-z_"][\w"]*)\s+[A-Za-z_]/);
      if (columnMatch?.[1]) {
        drafts.push({
          label: columnMatch[1].replace(/"/g, ''),
          kind: 'property',
          line,
          depth: 2,
        });
      }
    }
  }
  return drafts;
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
