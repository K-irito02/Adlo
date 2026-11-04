import { BLOCK_KEYWORDS, type OutlineDraft } from './types';
import { countChars, countLeadingClosers, stripQuotedText } from './utils';

function sanitizeBraceLine(lineText: string): string {
  return stripQuotedText(lineText)
    .replace(/\/\/.*$/g, '')
    .replace(/\/\*.*?\*\//g, '');
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
  options?: { includeScalarValues?: boolean },
): string | undefined {
  const keyMatch = trimmed.match(
    /^(?:readonly\s+)?(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$-]*))\s*:\s*(.*)$/,
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

export function parseBraceLanguage(
  content: string,
  options?: { includeObjectProperties?: boolean; includeScalarObjectProperties?: boolean },
): OutlineDraft[] {
  let braceDepth = 0;
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {
      return [];
    }

    const sanitized = sanitizeBraceLine(lineText);
    const effectiveBraceDepth = Math.max(0, braceDepth - countLeadingClosers(sanitized, '}]'));
    const items: OutlineDraft[] = [];

    for (const matcher of BRACE_MATCHERS) {
      const match = trimmed.match(matcher.pattern);
      const label = match?.[1]?.trim();
      if (!label) {
        continue;
      }
      if (matcher.kind === 'function' || matcher.kind === 'method') {
        const keyword = label.split('::').pop()?.toLowerCase() ?? '';
        if (BLOCK_KEYWORDS.has(keyword)) {
          continue;
        }
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
      braceDepth + countChars(sanitized, '{[') - countChars(sanitized, '}]'),
    );
    return items;
  });
}
