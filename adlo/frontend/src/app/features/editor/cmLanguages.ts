import type { Extension } from '@codemirror/state';

const yamlLoader: () => Promise<Extension[]> = async () => {
  const { yaml } = await import('@codemirror/lang-yaml');
  return [yaml()];
};

const htmlLoader: () => Promise<Extension[]> = async () => {
  const { html } = await import('@codemirror/lang-html');
  return [html()];
};

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
  yaml: yamlLoader,
  config: yamlLoader,
  html: htmlLoader,
  vue: htmlLoader,
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
  cpp: async () => {
    const { cpp } = await import('@codemirror/lang-cpp');
    return [cpp()];
  },
  java: async () => {
    const { java } = await import('@codemirror/lang-java');
    return [java()];
  },
};

const extensionCache = new Map<string, Extension[]>();
/** 进行中的加载（并发去重）：语言就绪闸门期间预热会被反复调用，见 `getLanguageExtension`。 */
const pendingLoads = new Map<string, Promise<Extension[]>>();

export function getLanguageExtensionSync(languageId: string): Extension[] {
  const cached = extensionCache.get(languageId);
  if (cached) {
    return cached;
  }
  return [];
}

export async function getLanguageExtension(languageId: string): Promise<Extension[]> {
  const cached = extensionCache.get(languageId);
  if (cached) {
    return cached;
  }
  const loader = languageLoaders[languageId];
  if (!loader) {
    return [];
  }
  // 合并并发加载：就绪闸门期间（`attemptPendingReveal` 每次尝试都会预热）与编辑器自身
  // 的加载会并发命中同一语言；不去重就会重复动态 import 并构造多份扩展实例。
  const inFlight = pendingLoads.get(languageId);
  if (inFlight) {
    return inFlight;
  }
  const load = loader()
    .then((extensions) => {
      extensionCache.set(languageId, extensions);
      return extensions;
    })
    .finally(() => {
      // 只清 in-flight，不缓存失败：加载失败允许下次重试（调用方各自兜底）。
      pendingLoads.delete(languageId);
    });
  pendingLoads.set(languageId, load);
  return load;
}

/**
 * 语法扩展是否已就绪：已解析入库，或该语言本就无需扩展。
 * 供"揭示前就绪闸门"使用 —— 扩展是异步动态 import，resolve 后会让编辑器的
 * 扩展集合发生变化并触发重新量测；若这次变化发生在揭示之后，落点会被推走。
 */
export function isLanguageExtensionReady(languageId: string): boolean {
  return extensionCache.has(languageId) || languageLoaders[languageId] === undefined;
}

/**
 * 预热语法扩展：与"读文件内容"并行发起，使扩展与内容尽量同批应用，
 * 从源头减少"揭示之后布局才变"的窗口（import 失败由调用方兜底，不抛出）。
 */
export function preloadLanguageExtension(languageId: string): void {
  void getLanguageExtension(languageId).catch(() => {
    /* 语言扩展加载失败：编辑器退化为无语法高亮，不影响揭示 */
  });
}
