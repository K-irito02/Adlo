import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ensureSiteFavicon,
  ensureSiteFaviconHttp,
  resetFaviconSelfHealThrottleForTest,
  shouldAttemptFaviconSelfHeal,
} from '../faviconSelfHeal';

const { refreshMock, getFaviconUrlMock, fetchHttpMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  getFaviconUrlMock: vi.fn(),
  fetchHttpMock: vi.fn(),
}));

vi.mock('@utils/pageMetaClient', () => ({
  pageMetaClient: { refresh: refreshMock, getSilent: vi.fn(), fetchHttp: fetchHttpMock },
}));

vi.mock('@utils/favicon', () => ({ getFaviconUrl: getFaviconUrlMock }));

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  resetFaviconSelfHealThrottleForTest();
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(null);
  fetchHttpMock.mockReset();
  fetchHttpMock.mockResolvedValue(null);
  getFaviconUrlMock.mockReset();
  getFaviconUrlMock.mockReturnValue('');
});

describe('ensureSiteFavicon', () => {
  it('refreshes once when the page has no resolvable icon', async () => {
    ensureSiteFavicon('https://gitee.com/K_irito/Adlo');
    await flush();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledWith('https://gitee.com/K_irito/Adlo');
  });

  it('skips pages that already have a displayable icon', () => {
    getFaviconUrlMock.mockReturnValue('data:image/png;base64,AA');
    ensureSiteFavicon('https://has-icon.example');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('force re-refreshes when an existing icon URL cannot render', async () => {
    // 外部图标存在但加载失败（防盗链）：需要重抓拿回 data-URI。
    getFaviconUrlMock.mockReturnValue('https://cdn.example/broken.ico');
    ensureSiteFavicon('https://hotlink.example', { force: true });
    await flush();
    expect(refreshMock).toHaveBeenCalledWith('https://hotlink.example');
  });

  it('force refreshes even inside the regular throttle window, on a separate 60s cooldown', async () => {
    // 先来一次常规补抓（写常规节流）→ 图标随后加载失败需要 force：常规节流不得吞掉它。
    ensureSiteFavicon('https://force-after-throttle.example');
    await flush();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    getFaviconUrlMock.mockReturnValue('https://cdn.example/broken.ico');
    ensureSiteFavicon('https://force-after-throttle.example', { force: true });
    await flush();
    expect(refreshMock).toHaveBeenCalledTimes(2);
    // force 自带 60s 冷却，窗口内再 force 不重复。
    ensureSiteFavicon('https://force-after-throttle.example', { force: true });
    await flush();
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it('throttles repeats per URL within the session window', async () => {
    ensureSiteFavicon('https://once.example');
    await flush();
    ensureSiteFavicon('https://once.example');
    await flush();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    // 节流表本身也可单独断言（书签自愈路径共用同一窗口）。
    expect(shouldAttemptFaviconSelfHeal('https://once.example')).toBe(false);
  });

  it('passive-list path uses HTTP-only and never refresh (no hidden WebView)', async () => {
    ensureSiteFaviconHttp('https://bookmark.example');
    await flush();
    expect(fetchHttpMock).toHaveBeenCalledWith('https://bookmark.example');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('ignores non-http(s) URLs (file/about/new-tab page)', () => {
    ensureSiteFavicon('about:blank');
    ensureSiteFavicon('file:///C:/a.html');
    ensureSiteFaviconHttp('about:blank');
    expect(refreshMock).not.toHaveBeenCalled();
    expect(fetchHttpMock).not.toHaveBeenCalled();
  });

  it('caps concurrent backfills at 2 and drains the queue in order', async () => {
    const resolvers: (() => void)[] = [];
    refreshMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(null));
        }),
    );
    ensureSiteFavicon('https://q1.example');
    ensureSiteFavicon('https://q2.example');
    ensureSiteFavicon('https://q3.example');
    expect(refreshMock).toHaveBeenCalledTimes(2);
    expect(refreshMock.mock.calls.map((c) => c[0])).toEqual([
      'https://q1.example',
      'https://q2.example',
    ]);
    resolvers[0]!();
    await flush();
    expect(refreshMock).toHaveBeenCalledTimes(3);
    expect(refreshMock.mock.calls[2]?.[0]).toBe('https://q3.example');
    resolvers[1]!();
    resolvers[2]!();
    await flush();
  });
});
