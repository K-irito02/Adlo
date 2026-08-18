export function existingFaviconBaseline(existing?: {
  faviconDataUri?: string;
  faviconUrl?: string;
}): string {
  return existing?.faviconDataUri || existing?.faviconUrl || '';
}

/**
 * 前端框架默认占位图标检测（Vite `/vite.svg`、Next `/next.svg`、Vercel `/vercel.svg` 等）。
 * 与 Rust `adl_browser::is_framework_default_favicon` 镜像对齐。
 */
export function isFrameworkDefaultFavicon(favicon: string): boolean {
  const lower = favicon.trim().toLowerCase();
  if (!/^(https?:)?\/\//.test(lower)) {
    return false;
  }
  const path = lower.split(/[?#]/)[0];
  const file = path.split('/').pop() || '';
  return [
    'vite.svg',
    'next.svg',
    'vercel.svg',
    'now.svg',
    'favicon.svg',
    'logo.svg',
    'react.svg',
    'svelte-logo.svg',
    'nuxt.svg',
    'vitejs.svg',
  ].includes(file);
}

export function getFaviconQualityScore(favicon: string): number {
  if (!favicon) {
    return 0;
  }
  const lower = favicon.toLowerCase();

  if (
    lower.includes('google.com/s2/favicons') ||
    lower.includes('favicon.cc') ||
    lower.includes('faviconkit') ||
    lower.includes('besticon') ||
    lower.includes('favicon-generator')
  ) {
    return 1;
  }

  if (isFrameworkDefaultFavicon(lower)) {
    return 3;
  }

  if (lower.endsWith('/favicon.ico')) {
    return 2;
  }
  if (lower.endsWith('favicon.ico')) {
    return 3;
  }
  if (lower.endsWith('.ico')) {
    return 4;
  }
  if (lower.endsWith('.svg')) {
    return 10;
  }
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif')
  ) {
    const sizeMatch = lower.match(/(\d+)(?:x\d+)?\.(?:png|jpg|webp|gif)$/);
    if (sizeMatch) {
      const size = parseInt(sizeMatch[1], 10);
      if (size >= 256) {
        return 15;
      }
      if (size >= 128) {
        return 14;
      }
      if (size >= 64) {
        return 13;
      }
      if (size >= 32) {
        return 12;
      }
      return 11;
    }
    if (lower.includes('apple-touch-icon')) {
      return 13;
    }
    if (
      lower.includes('512') ||
      lower.includes('256') ||
      lower.includes('192') ||
      lower.includes('180')
    ) {
      return 14;
    }
    return 11;
  }
  return 3;
}

export function shouldReplaceFavicon(existing: string | undefined, incoming: string): boolean {
  if (!incoming) {
    return false;
  }
  if (existing?.startsWith('data:')) {
    return false;
  }
  if (!existing) {
    return true;
  }
  const existingScore = getFaviconQualityScore(existing);
  const incomingScore = getFaviconQualityScore(incoming);
  return incomingScore >= existingScore;
}
