import { describe, expect, it } from 'vitest';
import { computeNavigatorCount } from './useBrowserTabs';

function makeTab(id: string) {
  return {
    id,
    title: id,
    url: `https://${id}.example`,
    workspaceId: 'ws-1',
    titleResolved: false,
    isPinned: false,
    isPlayingAudio: false,
    isAudioMuted: false,
    sortOrder: 0,
    isDownloading: false,
  };
}

function makeSearchResult(url: string) {
  return { title: url, url, source: 'saved' };
}

describe('computeNavigatorCount (mode-aware header count)', () => {
  it('open mode: returns browserTabs.length', () => {
    const tabs = [makeTab('t1'), makeTab('t2'), makeTab('t3')];
    expect(computeNavigatorCount('open', '', tabs, [], [], [], [], [])).toBe(3);
  });

  it('open mode with 0 open tabs returns 0', () => {
    expect(computeNavigatorCount('open', '', [], [], [], [], [], [])).toBe(0);
  });

  it('tabs mode: returns browserTabs.length', () => {
    const tabs = [makeTab('t1'), makeTab('t2')];
    expect(computeNavigatorCount('tree', '', tabs, [], [], [], [], [])).toBe(2);
  });

  it('list mode: returns browserTabs.length', () => {
    const tabs = [makeTab('t1')];
    expect(computeNavigatorCount('list', '', tabs, [], [], [], [], [])).toBe(1);
  });

  it('search mode: returns searchResults.length', () => {
    const results = [makeSearchResult('a'), makeSearchResult('b')];
    expect(computeNavigatorCount('search', '', [], [], [], results, [], [])).toBe(2);
  });

  it('search mode with empty results returns 0', () => {
    expect(computeNavigatorCount('search', 'query', [], [], [], [], [], [])).toBe(0);
  });
});
