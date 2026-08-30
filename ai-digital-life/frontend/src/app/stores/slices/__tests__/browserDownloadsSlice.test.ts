import { describe, it, expect } from 'vitest';
import { tabStillDownloading, updateTabsForDownloadState } from '../browserDownloadsSlice';
import type { DownloadRecord } from '@shared/ipc/download';
import type { BrowserTabState } from '../browserTypes';

function download(overrides: Partial<DownloadRecord>): DownloadRecord {
  return {
    id: 'd1',
    url: 'https://example.com/file.zip',
    file_name: 'file.zip',
    file_path: '/tmp/file.zip',
    total_bytes: null,
    bytes_received: 0,
    mime_type: null,
    status: 'in_progress',
    interrupt_reason: null,
    created_at: 0,
    completed_at: null,
    source_tab_id: 'tab-1',
    ...overrides,
  };
}

function tab(id: string, isDownloading: boolean): BrowserTabState {
  return {
    id,
    url: '',
    title: '',
    isDownloading,
  } as BrowserTabState;
}

describe('browserDownloadsSlice — tabStillDownloading', () => {
  it('returns false when there is no source tab', () => {
    expect(tabStillDownloading([download({ source_tab_id: null })], null)).toBe(false);
    expect(tabStillDownloading([], undefined)).toBe(false);
  });

  it('returns true when another in_progress download for the same tab remains', () => {
    const downloads = [
      download({ id: 'a', status: 'completed' }),
      download({ id: 'b', status: 'in_progress' }),
    ];
    expect(tabStillDownloading(downloads, 'tab-1')).toBe(true);
  });

  it('returns false when no in_progress download for the tab remains', () => {
    const downloads = [
      download({ id: 'a', status: 'completed' }),
      download({ id: 'b', status: 'failed' }),
    ];
    expect(tabStillDownloading(downloads, 'tab-1')).toBe(false);
  });

  it('ignores downloads from other tabs', () => {
    const downloads = [download({ id: 'other', status: 'in_progress', source_tab_id: 'tab-2' })];
    expect(tabStillDownloading(downloads, 'tab-1')).toBe(false);
  });

  it('treats paused downloads as not protecting the tab', () => {
    const downloads = [download({ id: 'a', status: 'paused' })];
    expect(tabStillDownloading(downloads, 'tab-1')).toBe(false);
  });
});

describe('browserDownloadsSlice — updateTabsForDownloadState', () => {
  it('keeps isDownloading true when the same tab still has an active download', () => {
    const tabs = [tab('tab-1', false)];
    const downloads = [
      download({ id: 'a', status: 'completed' }),
      download({ id: 'b', status: 'in_progress' }),
    ];
    const next = updateTabsForDownloadState(tabs, downloads, 'tab-1');
    expect(next[0].isDownloading).toBe(true);
  });

  it('clears isDownloading when no active download remains for the tab', () => {
    const tabs = [tab('tab-1', true)];
    const downloads = [download({ id: 'a', status: 'completed' })];
    const next = updateTabsForDownloadState(tabs, downloads, 'tab-1');
    expect(next[0].isDownloading).toBe(false);
  });

  it('leaves tabs untouched when no source tab is provided', () => {
    const tabs = [tab('tab-1', true)];
    const next = updateTabsForDownloadState(tabs, [], undefined);
    expect(next).toBe(tabs);
  });
});
