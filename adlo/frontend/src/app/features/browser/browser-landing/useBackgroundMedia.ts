import { useEffect, useState } from 'react';
import type { BackgroundConfig } from '@stores/slices/browserSlice';
import { resolveBackgroundUrl } from './backgroundAssets';

interface BackgroundMediaState {
  url: string | null;
  loading: boolean;
}

/**
 * 把持久化配置解析成可加载 URL。
 *
 * 依赖只取两种来源字段（而不是整个 config 对象）：音量/缩放变化不应重新打开
 * IndexedDB 或重建 object URL。
 */
export function useBackgroundMediaUrl(config: BackgroundConfig): BackgroundMediaState {
  const { assetPath, assetId } = config;
  const [state, setState] = useState<BackgroundMediaState>({ url: null, loading: true });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const key = `${assetPath ?? ''}|${assetId ?? ''}`;

  useEffect(() => {
    let canceled = false;
    let revoke: (() => void) | undefined;
    if (!assetPath && !assetId) {
      setState({ url: null, loading: false });
      setLoadedKey(key);
      return;
    }
    setState((previous) => ({ url: previous.url, loading: true }));
    resolveBackgroundUrl({ mode: config.mode, fit: config.fit, assetPath, assetId })
      .then((resolved) => {
        if (canceled) {
          resolved.revoke?.();
          return;
        }
        revoke = resolved.revoke;
        setState({ url: resolved.url, loading: false });
        setLoadedKey(key);
      })
      .catch((error: unknown) => {
        if (canceled) {
          return;
        }
        console.warn('resolve background media failed', error);
        setState({ url: null, loading: false });
        setLoadedKey(key);
      });
    return () => {
      canceled = true;
      revoke?.();
    };
    // config.mode/fit 只影响预设映射，不参与 URL 解析。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { url: state.url, loading: state.loading || loadedKey !== key };
}
