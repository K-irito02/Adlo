import { common, createStarryNight } from '@wooorm/starry-night';
import { toHtml } from 'hast-util-to-html';

type StarryNightInstance = Awaited<ReturnType<typeof createStarryNight>>;

let pending: Promise<StarryNightInstance | null> | null = null;
let readyInstance: StarryNightInstance | null = null;
const listeners = new Set<() => void>();

function notifyReady(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** 订阅 starry-night 就绪（与 useSyncExternalStore 语义对齐的最小实现）。 */
export function subscribeStarryReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isStarryReady(): boolean {
  return readyInstance !== null;
}

/**
 * 异步创建全局唯一的 starry-night 实例（common 约 35 语言）。
 * WASM 走本地 `vendor/onig.wasm`（见 `frontend/public/vendor/`），避免运行时依赖外网；
 * Node/测试环境回退默认 fs 加载。失败返回 null，调用方保持纯文本回退。
 */
export function ensureStarryNight(): Promise<StarryNightInstance | null> {
  if (readyInstance) {
    return Promise.resolve(readyInstance);
  }
  if (!pending) {
    const options =
      typeof window === 'undefined'
        ? undefined
        : {
            getOnigurumaUrlFetch: () => new URL('vendor/onig.wasm', document.baseURI),
          };
    // 本地 vendor 优先（离线可用）；失败回退默认加载器（Node fs / esm.sh），
    // 再失败返回 null，调用方保持纯文本回退（首屏与降级都不白屏）。
    pending = createStarryNight(common, options)
      .catch(() => createStarryNight(common))
      .then(
        (instance) => {
          readyInstance = instance;
          pending = null;
          notifyReady();
          return instance;
        },
        () => {
          pending = null;
          return null;
        },
      );
  }
  return pending;
}

/**
 * starry-night 就绪后的同步高亮（`createStarryNight` 之后 `highlight` 本身是同步的）。
 * 未就绪或未知语言返回 null，调用方回退 HTML 转义纯文本。
 */
export function highlightWithStarry(code: string, lang: string): string | null {
  if (!readyInstance) {
    return null;
  }
  const scope = readyInstance.flagToScope(lang);
  if (!scope) {
    return null;
  }
  try {
    return toHtml(readyInstance.highlight(code, scope));
  } catch {
    return null;
  }
}
