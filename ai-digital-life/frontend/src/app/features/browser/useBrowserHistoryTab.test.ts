import { describe, expect, it } from 'vitest';
import { findTabByUrl } from './useBrowserTabs';
import type { BrowserTabState } from '@stores/slices/browserSlice';

function makeTab(id: string, url: string): BrowserTabState {
  return {
    id,
    url,
    title: id,
    workspaceId: 'ws-1',
    titleResolved: false,
    isPinned: false,
    isPlayingAudio: false,
    isAudioMuted: false,
    sortOrder: 0,
  };
}

describe('findTabByUrl', () => {
  it('returns tab id when URL matches', () => {
    const tabs = [makeTab('t1', 'https://example.com/page'), makeTab('t2', 'https://other.com')];
    expect(findTabByUrl(tabs, 'https://example.com/page')).toBe('t1');
  });

  it('returns undefined when no tab matches', () => {
    const tabs = [makeTab('t1', 'https://example.com')];
    expect(findTabByUrl(tabs, 'https://nonexistent.com')).toBeUndefined();
  });

  it('ignores trailing slash differences', () => {
    const tabs = [makeTab('t1', 'https://example.com/page/')];
    expect(findTabByUrl(tabs, 'https://example.com/page')).toBe('t1');
    expect(findTabByUrl(tabs, 'https://example.com/page/')).toBe('t1');
  });

  it('matches about:blank tabs too', () => {
    const tabs = [makeTab('t1', 'about:blank')];
    expect(findTabByUrl(tabs, 'about:blank')).toBe('t1');
  });

  it('returns first match when multiple tabs have same URL', () => {
    const tabs = [makeTab('t1', 'https://dup.com'), makeTab('t2', 'https://dup.com')];
    expect(findTabByUrl(tabs, 'https://dup.com')).toBe('t1');
  });
});
