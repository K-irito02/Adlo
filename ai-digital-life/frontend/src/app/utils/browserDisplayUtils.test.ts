import { describe, expect, it } from 'vitest';
import {
  historyDedupKey,
  hasViewIdentityParam,
  historyContainerKey,
  historyDocumentKey,
  isPlaceholderTitle,
  normalizeTabTitle,
  resolveDisplayTitle,
  resolveSiteTitle,
} from './browserDisplayUtils';

describe('isPlaceholderTitle', () => {
  it('empty, pure URL, and bare hostname are placeholders', () => {
    expect(isPlaceholderTitle('', 'https://a.com/')).toBe(true);
    expect(isPlaceholderTitle('https://a.com/', 'https://a.com/')).toBe(true);
    expect(isPlaceholderTitle('a.com', 'https://a.com/')).toBe(true);
    expect(isPlaceholderTitle('www.a.com', 'https://a.com/')).toBe(true);
  });
  it('scheme-less host/path labels (SPA pre-hydration title) are placeholders', () => {
    expect(isPlaceholderTitle('douyin.com/jingxuan', 'https://www.douyin.com/jingxuan')).toBe(true);
    expect(
      isPlaceholderTitle('m.youtube.com/watch?v=AAA', 'https://www.youtube.com/watch?v=AAA'),
    ).toBe(true);
  });
  it('custom titles are not placeholders', () => {
    expect(isPlaceholderTitle('我的书签', 'https://a.com/')).toBe(false);
    expect(isPlaceholderTitle('A Real Title', 'https://a.com/')).toBe(false);
  });
});

describe('normalizeTabTitle', () => {
  it('keeps a real title', () => {
    expect(normalizeTabTitle('第97集 | 河北村民上山砍柴', 'https://www.douyin.com/video/1')).toBe(
      '第97集 | 河北村民上山砍柴',
    );
  });
  it('falls back to hostname for URL sessions and scheme-less host/path labels', () => {
    expect(normalizeTabTitle('', 'https://www.douyin.com/jingxuan')).toBe('douyin.com');
    expect(
      normalizeTabTitle('https://www.douyin.com/jingxuan', 'https://www.douyin.com/jingxuan'),
    ).toBe('douyin.com');
    expect(normalizeTabTitle('douyin.com/jingxuan', 'https://www.douyin.com/jingxuan')).toBe(
      'douyin.com',
    );
  });
});

describe('resolveDisplayTitle', () => {
  it('returns snapshot title when it is custom (never overwritten)', () => {
    expect(resolveDisplayTitle('我的书签', '服务端标题', 'https://a.com/')).toBe('我的书签');
    expect(resolveDisplayTitle('Real Title', 'Server Title', 'https://a.com/')).toBe('Real Title');
  });
  it('falls back to meta title when snapshot is a placeholder', () => {
    expect(resolveDisplayTitle('', '服务端标题', 'https://a.com/')).toBe('服务端标题');
    expect(resolveDisplayTitle('https://a.com/', '服务端标题', 'https://a.com/')).toBe(
      '服务端标题',
    );
    expect(resolveDisplayTitle('a.com', '服务端标题', 'https://a.com/')).toBe('服务端标题');
  });
  it('falls back to snapshot placeholder hostname when meta title is empty/placeholder (never empty)', () => {
    expect(resolveDisplayTitle('', '', 'https://a.com/')).toBe('');
    // 快照占位（宿主名）保持显示，不用空 metaTitle 覆盖成空 → 不显示空标题
    expect(resolveDisplayTitle('a.com', '', 'https://a.com/')).toBe('a.com');
    expect(resolveDisplayTitle('a.com', '', 'https://a.com/')).toBe('a.com');
  });
});

describe('resolveSiteTitle', () => {
  it('keeps a real stored title', () => {
    expect(resolveSiteTitle('第97集 | 视频标题', '', 'https://www.douyin.com/video/1', true)).toBe(
      '第97集 | 视频标题',
    );
  });
  it('uses a real meta title when stored title is a placeholder', () => {
    expect(
      resolveSiteTitle('douyin.com', '第97集 | 视频标题', 'https://www.douyin.com/video/1', true),
    ).toBe('第97集 | 视频标题');
    expect(resolveSiteTitle('', '第97集 | 视频标题', 'https://www.douyin.com/video/1', false)).toBe(
      '第97集 | 视频标题',
    );
  });
  it('returns empty placeholder while fetch not settled even if no real title yet', () => {
    expect(resolveSiteTitle('', '', 'https://a.com/', false)).toBe('');
    expect(resolveSiteTitle('douyin.com', '', 'https://www.douyin.com/jingxuan', false)).toBe('');
  });
  it('falls back to hostname only after fetch is settled with no real title', () => {
    expect(resolveSiteTitle('', '', 'https://www.douyin.com/jingxuan', true)).toBe('douyin.com');
    expect(resolveSiteTitle('douyin.com', '', 'https://www.douyin.com/jingxuan', true)).toBe(
      'douyin.com',
    );
  });
});

describe('historyDedupKey', () => {
  it('produces different keys for different query strings (the bug being fixed)', () => {
    expect(historyDedupKey('https://youtube.com/watch?v=AAA')).not.toBe(
      historyDedupKey('https://youtube.com/watch?v=BBB'),
    );
  });

  it('produces the same key for the same URL (stability)', () => {
    expect(historyDedupKey('https://example.com/page')).toBe(
      historyDedupKey('https://example.com/page'),
    );
  });

  it('ignores the hash fragment', () => {
    expect(historyDedupKey('https://example.com/page#hash')).toBe(
      historyDedupKey('https://example.com/page'),
    );
  });

  it('falls back to the raw input for invalid URLs', () => {
    expect(historyDedupKey('invalid-url')).toBe('invalid-url');
  });

  it('strips the www. prefix', () => {
    expect(historyDedupKey('https://www.example.com/page')).toBe(
      historyDedupKey('https://example.com/page'),
    );
  });

  it('includes the query string in the returned key', () => {
    expect(historyDedupKey('https://youtube.com/watch?v=AAA')).toBe('youtube.com/watch?v=AAA');
  });

  it('strips trailing slash from non-root paths', () => {
    expect(historyDedupKey('https://example.com/page/')).toBe(
      historyDedupKey('https://example.com/page'),
    );
  });

  it('preserves the root path slash', () => {
    expect(historyDedupKey('https://example.com/')).toBe('example.com/');
  });

  it('strips known tracking params (Bilibili vd_source) so variants collapse', () => {
    expect(historyDedupKey('https://www.bilibili.com/video/BV1eSGP6BEfn')).toBe(
      historyDedupKey('https://www.bilibili.com/video/BV1eSGP6BEfn?vd_source=f2043'),
    );
    expect(historyDedupKey('https://www.bilibili.com/video/BV1eSGP6BEfn?vd_source=f2043')).toBe(
      'bilibili.com/video/BV1eSGP6BEfn',
    );
  });

  it('strips multiple tracking params (vd_source, spm_id_from, trackid)', () => {
    const withTrackers =
      'https://www.bilibili.com/video/BV1W9enziEGi?spm_id_from=333.788.recommend_more_video.0&trackid=web_related_0.router-related-2479604&vd_source=f204375acc1';
    const without = 'https://www.bilibili.com/video/BV1W9enziEGi';
    expect(historyDedupKey(withTrackers)).toBe(historyDedupKey(without));
    expect(historyDedupKey(withTrackers)).toBe('bilibili.com/video/BV1W9enziEGi');
  });

  it('sorts remaining query params so reordered variants collapse', () => {
    expect(historyDedupKey('https://example.com/video?b=2&a=1')).toBe(
      historyDedupKey('https://example.com/video?a=1&b=2'),
    );
  });

  it('keeps meaningful query params (YouTube v) distinct', () => {
    expect(historyDedupKey('https://youtube.com/watch?v=AAA')).not.toBe(
      historyDedupKey('https://youtube.com/watch?v=BBB'),
    );
  });

  it('keeps meaningful params when tracking params are also present', () => {
    expect(historyDedupKey('https://youtube.com/watch?v=AAA&utm_source=x')).toBe(
      'youtube.com/watch?v=AAA',
    );
  });

  it('strips UTM and ad click params', () => {
    expect(
      historyDedupKey(
        'https://example.com/page?utm_source=news&utm_medium=email&utm_campaign=launch&gclid=abc',
      ),
    ).toBe('example.com/page');
  });

  it('collapses YouTube radio churn (start_radio + auto-generated list=RD queue)', () => {
    const withRadio = 'https://youtube.com/watch?v=AAA&list=RDR0di5GVDKMU&start_radio=1';
    const withoutRadio = 'https://youtube.com/watch?v=AAA';
    expect(historyDedupKey(withRadio)).toBe(historyDedupKey(withoutRadio));
    expect(historyDedupKey(withRadio)).toBe('youtube.com/watch?v=AAA');
  });

  it('collapses YouTube radio queue-progress markers (pp / index) in radio mode', () => {
    const entry = 'https://youtube.com/watch?v=AAA&list=RDGwoY5ooF8oQ&start_radio=1';
    const withPp = 'https://youtube.com/watch?v=AAA&list=RDGwoY5ooF8oQ&start_radio=1&pp=oAcB';
    const withIndex = 'https://youtube.com/watch?v=AAA&list=RDGwoY5ooF8oQ&index=8';
    expect(historyDedupKey(withPp)).toBe(historyDedupKey(entry));
    expect(historyDedupKey(withIndex)).toBe(historyDedupKey(entry));
    expect(historyDedupKey(withPp)).toBe('youtube.com/watch?v=AAA');
  });

  it('keeps a real user playlist (list=PL...) as part of the identity', () => {
    const playlist = 'https://youtube.com/watch?v=AAA&list=PLabc123';
    expect(historyDedupKey(playlist)).toBe('youtube.com/watch?list=PLabc123&v=AAA');
  });

  it('keeps index for a real playlist (not radio)', () => {
    const playlist = 'https://youtube.com/watch?v=AAA&list=PLabc123&index=2';
    expect(historyDedupKey(playlist)).toBe('youtube.com/watch?index=2&list=PLabc123&v=AAA');
  });

  it('keeps different radio videos distinct (v is still identity)', () => {
    const a = 'https://youtube.com/watch?v=AAA&list=RDR0di5GVDKMU&start_radio=1';
    const b = 'https://youtube.com/watch?v=BBB&list=RDR0di5GVDKMU&start_radio=1';
    expect(historyDedupKey(a)).not.toBe(historyDedupKey(b));
  });
});

describe('hasViewIdentityParam', () => {
  it('returns true only when the URL carries a modal_id param', () => {
    expect(hasViewIdentityParam('https://www.douyin.com/jingxuan')).toBe(false);
    expect(
      hasViewIdentityParam('https://www.douyin.com/jingxuan?modal_id=7667522447830256915'),
    ).toBe(true);
    expect(hasViewIdentityParam('https://www.douyin.com/jingxuan?foo=1&modal_id=2&bar=3')).toBe(
      true,
    );
  });

  it('returns false for URLs without modal_id', () => {
    expect(hasViewIdentityParam('https://youtube.com/watch?v=AAA')).toBe(false);
    expect(hasViewIdentityParam('not-a-url')).toBe(false);
  });
});

describe('historyContainerKey', () => {
  it('collapses a base feed URL and its modal_id video to the same container key', () => {
    expect(historyContainerKey('https://www.douyin.com/jingxuan')).toBe(
      historyContainerKey('https://www.douyin.com/jingxuan?modal_id=7667522447830256915'),
    );
  });

  it('equals historyDedupKey when no modal_id is present', () => {
    const url = 'https://example.com/page';
    expect(historyContainerKey(url)).toBe(historyDedupKey(url));
  });

  it('keeps different videos distinct (different modal_id)', () => {
    const a = historyContainerKey('https://www.douyin.com/jingxuan?modal_id=111');
    const b = historyContainerKey('https://www.douyin.com/jingxuan?modal_id=222');
    // Same container, but the video entries themselves stay distinct on their modal_id.
    expect(a).toBe(b);
    expect(historyDedupKey('https://www.douyin.com/jingxuan?modal_id=111')).not.toBe(
      historyDedupKey('https://www.douyin.com/jingxuan?modal_id=222'),
    );
  });

  it('does not collapse across different paths/hosts', () => {
    expect(historyContainerKey('https://a.com/jingxuan')).not.toBe(
      historyContainerKey('https://a.com/other'),
    );
    expect(historyContainerKey('https://a.com/jingxuan')).not.toBe(
      historyContainerKey('https://b.com/jingxuan'),
    );
  });
});

describe('historyDocumentKey', () => {
  it('collapses same-document variants that differ only in navigation/source params (Douyin user/self)', () => {
    const baseKey = historyDocumentKey('https://www.douyin.com/user/self');
    const variants = [
      'https://www.douyin.com/user/self?from_nav=1',
      'https://www.douyin.com/user/self?from_tab_name=main&showTab=like',
      'https://www.douyin.com/user/self?enter_from=discover&enter_method=left_entrance&from_tab_name=main&showTab=like',
      'https://www.douyin.com/user/self?from_nav=1&showTab=like',
      'https://www.douyin.com/user/self?recommend=1',
    ];
    for (const v of variants) {
      expect(historyDocumentKey(v)).toBe(baseKey);
    }
  });

  it('keeps different paths distinct', () => {
    expect(historyDocumentKey('https://www.douyin.com/user/self')).not.toBe(
      historyDocumentKey('https://www.douyin.com/jingxuan'),
    );
  });

  it('keeps different hosts distinct', () => {
    expect(historyDocumentKey('https://a.com/user/self')).not.toBe(
      historyDocumentKey('https://b.com/user/self'),
    );
  });

  it('keeps YouTube videos with different v distinct', () => {
    expect(historyDocumentKey('https://youtube.com/watch?v=AAA')).not.toBe(
      historyDocumentKey('https://youtube.com/watch?v=BBB'),
    );
  });

  it('collapses YouTube variants of the same video (v unchanged)', () => {
    expect(historyDocumentKey('https://youtube.com/watch?v=AAA&t=30')).toBe(
      historyDocumentKey('https://youtube.com/watch?v=AAA'),
    );
    expect(historyDocumentKey('https://youtube.com/watch?v=AAA&utm_source=x')).toBe(
      historyDocumentKey('https://youtube.com/watch?v=AAA'),
    );
  });

  it('keeps different Douyin modal_id videos distinct', () => {
    expect(historyDocumentKey('https://www.douyin.com/jingxuan?modal_id=111')).not.toBe(
      historyDocumentKey('https://www.douyin.com/jingxuan?modal_id=222'),
    );
  });

  it('keeps different search queries (q) distinct', () => {
    expect(historyDocumentKey('https://www.google.com/search?q=cat')).not.toBe(
      historyDocumentKey('https://www.google.com/search?q=dog'),
    );
  });

  it('keeps other content-identity params distinct (id/skuId/itemId/aid/search_query/wd/keyword)', () => {
    expect(historyDocumentKey('https://item.taobao.com/item.htm?id=1')).not.toBe(
      historyDocumentKey('https://item.taobao.com/item.htm?id=2'),
    );
    expect(historyDocumentKey('https://www.jd.com/product/skuId=1001')).not.toBe(
      historyDocumentKey('https://www.jd.com/product/skuId=1002'),
    );
    expect(historyDocumentKey('https://shop.com/p?itemId=abc')).not.toBe(
      historyDocumentKey('https://shop.com/p?itemId=def'),
    );
    expect(historyDocumentKey('https://www.toutiao.com/article/?aid=111')).not.toBe(
      historyDocumentKey('https://www.toutiao.com/article/?aid=222'),
    );
    expect(historyDocumentKey('https://www.google.com/search?search_query=cat')).not.toBe(
      historyDocumentKey('https://www.google.com/search?search_query=dog'),
    );
    expect(historyDocumentKey('https://www.baidu.com/s?wd=cat')).not.toBe(
      historyDocumentKey('https://www.baidu.com/s?wd=dog'),
    );
    expect(historyDocumentKey('https://search.com/?keyword=cat')).not.toBe(
      historyDocumentKey('https://search.com/?keyword=dog'),
    );
  });

  it('treats one-time auth token as non-identity (R1-Medium)', () => {
    // dsh `?token=` 轮换不得分裂历史身份；其它身份参数仍参与区分。
    expect(historyDocumentKey('http://127.0.0.1:3080/?token=abc')).toBe(
      historyDocumentKey('http://127.0.0.1:3080/?token=def'),
    );
    expect(historyDocumentKey('http://127.0.0.1:3080/?token=abc')).toBe(
      historyDocumentKey('http://127.0.0.1:3080/'),
    );
    expect(historyDocumentKey('https://a.com/p?x=1&token=abc')).toBe(
      historyDocumentKey('https://a.com/p?x=1'),
    );
  });
});
