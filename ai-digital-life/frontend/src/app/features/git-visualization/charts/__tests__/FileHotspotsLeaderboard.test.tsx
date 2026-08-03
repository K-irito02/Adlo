import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileHotspotsLeaderboard } from '../FileHotspotsLeaderboard';
import { fileHotspotsMockData } from '@/test-fixtures/gitVisMockData';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisHotspotsModeFull: 'Full Ranking',
      gitVisHotspotsModeDrill: 'Drill Down',
      gitVisHotspotsRankingName: 'Name',
      gitVisHotspotsRankingPath: 'Path',
      gitVisHotspotsRankingChangeCount: 'Changes',
      gitVisHotspotsRankingAdditions: 'Added',
      gitVisHotspotsRankingDeletions: 'Deleted',
      gitVisHotspotsRankingNet: 'Net',
      gitVisHotspotsEmpty: 'No changed files',
      gitVisHotspotsDrillHint: 'Click a directory row to drill down',
    },
    locale: 'en-US',
    formatT: vi.fn(),
  }),
}));

vi.mock('../../ModuleBreadcrumb', () => ({
  ModuleBreadcrumb: ({
    pathSegments,
    onNavigate,
  }: {
    pathSegments: string[];
    onNavigate: (level: number) => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'breadcrumb' },
      React.createElement('button', { onClick: () => onNavigate(-1) }, 'Root'),
      pathSegments.map((seg, i) =>
        React.createElement('button', { key: i, onClick: () => onNavigate(i) }, seg),
      ),
    ),
}));

vi.mock('../../ModuleTreeCard', () => ({
  ModuleTreeCard: ({
    onSelect,
    onClose,
  }: {
    onSelect: (path: string) => void;
    onClose: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'tree-card' },
      React.createElement('button', { onClick: () => onSelect('src/core') }, 'Jump'),
      React.createElement('button', { onClick: onClose }, 'Close'),
    ),
}));

function getRowNames(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll(
      '.adl-file-hotspots-ranking__row .adl-file-hotspots-ranking__cell--name',
    ),
  ).map((el) => el.textContent ?? '');
}

function getRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.adl-file-hotspots-ranking__row'));
}

beforeEach(() => {
  localStorage.clear();
});

describe('FileHotspotsLeaderboard', () => {
  it('renders all files in full mode with split name/path columns, sorted by change count desc', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    expect(getRowNames(container)).toEqual(['engine.ts', 'handler.ts', 'engine.test.ts']);
    expect(screen.getByText('src/core/engine.ts')).toBeTruthy();
    expect(screen.getByText('src/api/handler.ts')).toBeTruthy();
    expect(screen.getByText('tests/unit/engine.test.ts')).toBeTruthy();
  });

  it('re-sorts by net column and toggles direction', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByRole('button', { name: /^Net/ }));
    expect(getRowNames(container)).toEqual(['engine.ts', 'engine.test.ts', 'handler.ts']);
    fireEvent.click(screen.getByRole('button', { name: /^Net/ }));
    expect(getRowNames(container)).toEqual(['handler.ts', 'engine.test.ts', 'engine.ts']);
  });

  it('shows directory rows at tree root in drill mode', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Drill Down'));
    expect(getRowNames(container)).toEqual(['src', 'tests']);
  });

  it('drills down on directory row click and back via breadcrumb', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Drill Down'));
    expect(getRowNames(container)).toEqual(['src', 'tests']);

    fireEvent.click(getRows(container)[0]); // src (changeCount 35 > tests 12)
    expect(getRowNames(container)).toEqual(['core', 'api']);

    fireEvent.click(getRows(container)[0]); // core
    expect(getRowNames(container)).toEqual(['engine.ts']);

    fireEvent.click(screen.getByText('Root'));
    expect(getRowNames(container)).toEqual(['src', 'tests']);
  });

  it('clears drillPath when switching to full mode', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Drill Down'));
    fireEvent.click(getRows(container)[0]); // src
    expect(getRowNames(container)).toEqual(['core', 'api']);

    fireEvent.click(screen.getByText('Full Ranking'));
    expect(getRowNames(container)).toEqual(['engine.ts', 'handler.ts', 'engine.test.ts']);

    fireEvent.click(screen.getByText('Drill Down'));
    expect(getRowNames(container)).toEqual(['src', 'tests']);
  });

  it('opens the tree card on right-click and jumps on confirm', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Drill Down'));
    fireEvent.contextMenu(getRows(container)[0]); // src
    expect(screen.getByTestId('tree-card')).toBeTruthy();
    fireEvent.click(screen.getByText('Jump'));
    expect(getRowNames(container)).toEqual(['engine.ts']);
  });

  it('shows empty state when no data', () => {
    render(<FileHotspotsLeaderboard />);
    expect(screen.getByText('No changed files')).toBeTruthy();
  });
});
