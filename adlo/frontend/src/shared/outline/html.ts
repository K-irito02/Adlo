import { STRUCTURAL_HTML_TAGS, VOID_HTML_TAGS, type OutlineDraft } from './types';

function formatHtmlTagLabel(tag: string, attrs: string): string {
  const id = attrs.match(/\sid=["']([^"']+)["']/i)?.[1];
  if (id) {
    return `${tag}#${id}`;
  }
  const className = attrs
    .match(/\sclass=["']([^"']+)["']/i)?.[1]
    ?.split(/\s+/)
    .filter(Boolean)[0];
  if (className) {
    return `${tag}.${className}`;
  }
  const name = attrs.match(/\s(?:name|role)=["']([^"']+)["']/i)?.[1];
  if (name) {
    return `${tag}[${name}]`;
  }
  return tag;
}

function shouldOutlineHtmlTag(tag: string, attrs: string): boolean {
  return (
    STRUCTURAL_HTML_TAGS.has(tag) ||
    tag.includes('-') ||
    /\s(?:id|class|name|role)=["']/.test(attrs)
  );
}

export function parseHtml(content: string): OutlineDraft[] {
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
          if (current === tag) {
            break;
          }
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
