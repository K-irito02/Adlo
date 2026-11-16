import { describe, expect, it } from 'vitest';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import {
  mergePanelTabOrder,
  reorderTabs,
  sortPinnedFirst,
  validateTarget,
} from './useOpenTabReorder';

function tab(
  id: string,
  isPinned: boolean,
  location: BrowserTabState['location'] = 'panel',
): BrowserTabState {
  return {
    id,
    title: id,
    url: `https://${id}.test`,
    workspaceId: '',
    titleResolved: true,
    isPinned,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
    location,
  };
}

const pinnedA = tab('pinned-a', true);
const pinnedB = tab('pinned-b', true);
const normalA = tab('normal-a', false);
const normalB = tab('normal-b', false);
const normalC = tab('normal-c', false);

describe('sortPinnedFirst', () => {
  it('keeps pinned tabs first and preserves relative order', () => {
    expect(sortPinnedFirst([normalA, pinnedA, normalB, pinnedB]).map((t) => t.id)).toEqual([
      'pinned-a',
      'pinned-b',
      'normal-a',
      'normal-b',
    ]);
  });
});

describe('validateTarget', () => {
  const tabs = [pinnedA, pinnedB, normalA, normalB, normalC];

  it('allows pinned tabs at the pinned boundary', () => {
    expect(validateTarget(tabs, 'pinned-a', 2)).toBe(true);
  });

  it('rejects pinned tabs inside the normal group', () => {
    expect(validateTarget(tabs, 'pinned-a', 3)).toBe(false);
  });

  it('allows normal tabs at the normal boundary', () => {
    expect(validateTarget(tabs, 'normal-a', 2)).toBe(true);
  });

  it('rejects normal tabs inside the pinned group', () => {
    expect(validateTarget(tabs, 'normal-a', 1)).toBe(false);
  });
});

describe('reorderTabs', () => {
  it('reorders normal tabs without touching pinned tabs', () => {
    const next = reorderTabs([pinnedA, pinnedB, normalA, normalB, normalC], 'normal-c', 2);
    expect(next?.map((t) => t.id)).toEqual([
      'pinned-a',
      'pinned-b',
      'normal-c',
      'normal-a',
      'normal-b',
    ]);
  });

  it('moves a pinned tab to the end of the pinned group', () => {
    const next = reorderTabs([pinnedA, pinnedB, normalA], 'pinned-a', 2);
    expect(next?.map((t) => t.id)).toEqual(['pinned-b', 'pinned-a', 'normal-a']);
  });

  it('returns null for a cross-group move', () => {
    expect(reorderTabs([pinnedA, normalA], 'pinned-a', 2)).toBeNull();
    expect(reorderTabs([pinnedA, normalA], 'normal-a', 0)).toBeNull();
  });
});

describe('mergePanelTabOrder', () => {
  it('replaces panel order while keeping center tabs in their slots', () => {
    const center = tab('center', false, 'center');
    const full = [pinnedA, center, normalA, normalB];
    const orderedPanel = [normalB, pinnedA, normalA];
    const merged = mergePanelTabOrder(full, orderedPanel);
    expect(merged.filter((t) => t.location !== 'center').map((t) => t.id)).toEqual([
      'normal-b',
      'pinned-a',
      'normal-a',
    ]);
    expect(merged[1].id).toBe('center');
  });
});
