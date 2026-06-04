import type { Extension } from '@codemirror/state';

const languageLoaders: Record<string, () => Promise<Extension[]>> = {
  typescript: async () => {
    const { javascript } = await import('@codemirror/lang-javascript');
    return [javascript({ typescript: true, jsx: true })];
  },
  javascript: async () => {
    const { javascript } = await import('@codemirror/lang-javascript');
    return [javascript({ jsx: true })];
  },
  json: async () => {
    const { json } = await import('@codemirror/lang-json');
    return [json()];
  },
  yaml: async () => {
    const { yaml } = await import('@codemirror/lang-yaml');
    return [yaml()];
  },
  config: async () => {
    const { yaml } = await import('@codemirror/lang-yaml');
    return [yaml()];
  },
  html: async () => {
    const { html } = await import('@codemirror/lang-html');
    return [html()];
  },
  vue: async () => {
    const { html } = await import('@codemirror/lang-html');
    return [html()];
  },
  css: async () => {
    const { css } = await import('@codemirror/lang-css');
    return [css()];
  },
  markdown: async () => {
    const { markdown } = await import('@codemirror/lang-markdown');
    return [markdown()];
  },
  sql: async () => {
    const { sql } = await import('@codemirror/lang-sql');
    return [sql()];
  },
  python: async () => {
    const { python } = await import('@codemirror/lang-python');
    return [python()];
  },
  rust: async () => {
    const { rust } = await import('@codemirror/lang-rust');
    return [rust()];
  },
  xml: async () => {
    const { xml } = await import('@codemirror/lang-xml');
    return [xml()];
  },
};

const extensionCache = new Map<string, Extension[]>();

export async function getLanguageExtension(languageId: string): Promise<Extension[]> {
  const cached = extensionCache.get(languageId);
  if (cached) return cached;
  const loader = languageLoaders[languageId];
  if (!loader) return [];
  const extensions = await loader();
  extensionCache.set(languageId, extensions);
  return extensions;
}
