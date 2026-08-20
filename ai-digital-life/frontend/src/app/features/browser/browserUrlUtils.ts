export function normalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(url);
    // 剥离 modal_id：SPA 中 base≡modal_id 同属一页（抖音等），否则 base 与
    // modal_id 变体被判为不同 URL，引发 urlChanged 误判/缓存 miss。
    if (u.searchParams.has('modal_id')) {
      const kept = [...u.searchParams.entries()].filter(([k]) => k !== 'modal_id');
      u.search = kept.length ? `?${new URLSearchParams(kept).toString()}` : '';
    }
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    const noHash = url.split('#')[0] || url;
    if (noHash.length > 8 && noHash.endsWith('/')) {
      return noHash.replace(/\/+$/, '');
    }
    return noHash;
  }
}

export function isProbablySameSite(expected: string, actual: string): boolean {
  try {
    const expectedHost = new URL(expected).hostname;
    const actualHost = new URL(actual).hostname;
    if (expectedHost === actualHost) {
      return true;
    }
    const expectedParts = expectedHost.split('.');
    const actualParts = actualHost.split('.');
    if (expectedParts.length >= 2 && actualParts.length >= 2) {
      const expectedRoot = expectedParts.slice(-2).join('.');
      const actualRoot = actualParts.slice(-2).join('.');
      if (expectedRoot === actualRoot) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
