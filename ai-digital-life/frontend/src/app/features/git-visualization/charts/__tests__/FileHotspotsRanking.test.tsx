import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileHotspotsRanking } from '../FileHotspotsRanking';
import type { GitVisFileHotspotFile } from '@/shared/ipc/workspace';
import type { RankingSortKey, SortDir } from '../../hooks/useFileHotspotsState';

// Mock i18n
vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisHotspotsRankingFile: 'File',
      gitVisHotspotsRankingChangeCount: 'Changes',
      gitVisHotspotsRankingAdditions: 'Added',
      gitVisHotspotsRankingDeletions: 'Deleted',
      gitVisHotspotsRankingNet: 'Net',
      gitVisHotspotsRankingEmpty: 'No changed files in this directory',
      gitVisHotspotsFilterClear: 'Clear filter',
    },
  }),
}));

const files: GitVisFileHotspotFile[] = [
  { path: 'src/main.ts', changeCount: 10, additions: 20, deletions: 5, lastModified: '2026-08-01' },
  {
    path: 'src/core/engine.ts',
    changeCount: 8,
    additions: 15,
    deletions: 3,
    lastModified: '2026-07-31',
  },
  {
    path: 'tests/main.test.ts',
    changeCount: 5,
    additions: 10,
    deletions: 2,
    lastModified: '2026-07-30',
  },
];

const sortState = (overrides: Partial<{ sortKey: RankingSortKey; sortDir: SortDir }> = {}) => ({
  sortKey: overrides.sortKey ?? ('changeCount' as RankingSortKey),
  sortDir: overrides.sortDir ?? ('desc' as SortDir),
  onSort: vi.fn(),
});

describe('FileHotspotsRanking', () => {
  it('renders file rows', () => {
    render(
      <FileHotspotsRanking
        files={files}
        filterPath={[]}
        onClearFilter={vi.fn()}
        sortState={sortState()}
      />,
    );
    expect(screen.getByText('src/main.ts')).toBeTruthy();
    expect(screen.getByText('src/core/engine.ts')).toBeTruthy();
    expect(screen.getByText('tests/main.test.ts')).toBeTruthy();
  });

  it('filters files by filterPath', () => {
    render(
      <FileHotspotsRanking
        files={files}
        filterPath={['src']}
        onClearFilter={vi.fn()}
        sortState={sortState()}
      />,
    );
    expect(screen.getByText('main.ts')).toBeTruthy();
    expect(screen.getByText('core/engine.ts')).toBeTruthy();
    expect(screen.queryByText('tests/main.test.ts')).toBeFalsy();
  });

  it('shows clear filter button when filterPath is non-empty', () => {
    const onClearFilter = vi.fn();
    render(
      <FileHotspotsRanking
        files={files}
        filterPath={['src']}
        onClearFilter={onClearFilter}
        sortState={sortState()}
      />,
    );
    const clearBtn = screen.getByText('Clear filter');
    fireEvent.click(clearBtn);
    expect(onClearFilter).toHaveBeenCalled();
  });

  it('shows empty state when no files match filter', () => {
    render(
      <FileHotspotsRanking
        files={files}
        filterPath={['nonexistent']}
        onClearFilter={vi.fn()}
        sortState={sortState()}
      />,
    );
    expect(screen.getByText('No changed files in this directory')).toBeTruthy();
  });

  it('calls onSort when clicking sortable column header', () => {
    const onSort = vi.fn();
    render(
      <FileHotspotsRanking
        files={files}
        filterPath={[]}
        onClearFilter={vi.fn()}
        sortState={{ sortKey: 'changeCount', sortDir: 'desc', onSort }}
      />,
    );
    fireEvent.click(screen.getByText('Added'));
    expect(onSort).toHaveBeenCalledWith('additions');
  });

  it('sorts by net change when sortKey is net', () => {
    const sortedFiles: GitVisFileHotspotFile[] = [
      { path: 'a.ts', changeCount: 1, additions: 100, deletions: 10, lastModified: '2026-08-01' },
      { path: 'b.ts', changeCount: 1, additions: 5, deletions: 50, lastModified: '2026-08-01' },
    ];
    render(
      <FileHotspotsRanking
        files={sortedFiles}
        filterPath={[]}
        onClearFilter={vi.fn()}
        sortState={sortState({ sortKey: 'net', sortDir: 'desc' })}
      />,
    );
    // a.ts (net=90) should come before b.ts (net=-45)
    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('a.ts');
  });
});
