import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileHotspotsLeaderboard } from '../FileHotspotsLeaderboard';
import { fileHotspotsMockData } from '@/test-fixtures/gitVisMockData';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisHotspotsModeFull: 'Global Ranking',
      gitVisHotspotsModeDrill: 'Level Drill',
      gitVisHotspotsRankingName: 'Name',
      gitVisHotspotsRankingPath: 'Path',
      gitVisHotspotsRankingChangeCount: 'Changes',
      gitVisHotspotsRankingAdditions: 'Added',
      gitVisHotspotsRankingDeletions: 'Deleted',
      gitVisHotspotsRankingNet: 'Net',
      gitVisHotspotsEmpty: 'No changed files',
      gitVisHotspotsFullHint: 'Full ranking hint text',
      gitVisHotspotsDrillHint:
        'Drill hint: click directory row; right-click or jump button for path jump',
      gitVisHotspotsJump: 'Open module tree',
      gitVisHotspotsCopyName: 'Copy name',
      gitVisHotspotsCopyPath: 'Copy full path',
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

function getHint(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.adl-file-hotspots__hint');
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
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
    fireEvent.click(screen.getByText('Level Drill'));
    expect(getRowNames(container)).toEqual(['src', 'tests']);
  });

  it('drills down on directory row click and back via breadcrumb', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Level Drill'));
    expect(getRowNames(container)).toEqual(['src', 'tests']);

    fireEvent.click(getRows(container)[0]); // src (changeCount 35 > tests 12)
    expect(getRowNames(container)).toEqual(['core', 'api']);

    fireEvent.click(getRows(container)[0]); // core
    expect(getRowNames(container)).toEqual(['engine.ts']);

    fireEvent.click(screen.getByText('Root'));
    expect(getRowNames(container)).toEqual(['src', 'tests']);
  });

  it('preserves the drill path when switching modes and back', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Level Drill'));
    fireEvent.click(getRows(container)[0]); // src
    expect(getRowNames(container)).toEqual(['core', 'api']);

    fireEvent.click(screen.getByText('Global Ranking'));
    expect(getRowNames(container)).toEqual(['engine.ts', 'handler.ts', 'engine.test.ts']);

    fireEvent.click(screen.getByText('Level Drill'));
    expect(getRowNames(container)).toEqual(['core', 'api']);
  });

  it('opens the tree card on right-click and jumps on confirm', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Level Drill'));
    fireEvent.contextMenu(getRows(container)[0]); // src
    expect(screen.getByTestId('tree-card')).toBeTruthy();
    fireEvent.click(screen.getByText('Jump'));
    expect(getRowNames(container)).toEqual(['engine.ts']);
  });

  it('shows empty state when no data', () => {
    render(<FileHotspotsLeaderboard />);
    expect(screen.getByText('No changed files')).toBeTruthy();
  });

  it('shows a mode-specific hint below the chart', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    expect(getHint(container)?.textContent).toBe('Full ranking hint text');

    fireEvent.click(screen.getByText('Level Drill'));
    expect(getHint(container)?.textContent).toBe(
      'Drill hint: click directory row; right-click or jump button for path jump',
    );
  });

  it('renders the breadcrumb inside the toolbar in drill mode', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    expect(
      container.querySelector('.adl-file-hotspots__toolbar .adl-file-hotspots-ranking__filter-bar'),
    ).toBeNull();

    fireEvent.click(screen.getByText('Level Drill'));
    const breadcrumb = screen.getByTestId('breadcrumb');
    expect(breadcrumb).toBeTruthy();
    expect(breadcrumb.closest('.adl-file-hotspots__toolbar')).not.toBeNull();
  });

  it('marks the selected mode button as active', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    const [fullBtn, drillBtn] = container.querySelectorAll('.adl-file-hotspots__mode-btn');
    expect(fullBtn.classList.contains('adl-file-hotspots__mode-btn--active')).toBe(true);
    expect(drillBtn.classList.contains('adl-file-hotspots__mode-btn--active')).toBe(false);

    fireEvent.click(screen.getByText('Level Drill'));
    expect(fullBtn.classList.contains('adl-file-hotspots__mode-btn--active')).toBe(false);
    expect(drillBtn.classList.contains('adl-file-hotspots__mode-btn--active')).toBe(true);
  });

  it('shows a folder icon for directory rows and none for file rows', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    // full mode: all rows are files
    expect(container.querySelectorAll('.adl-file-hotspots-ranking__folder-icon').length).toBe(0);

    fireEvent.click(screen.getByText('Level Drill'));
    // tree root: src and tests are directories
    expect(container.querySelectorAll('.adl-file-hotspots-ranking__folder-icon').length).toBe(2);

    // drill into src then core to reach a file-only level
    fireEvent.click(getRows(container)[0]); // src
    fireEvent.click(getRows(container)[0]); // core
    expect(container.querySelectorAll('.adl-file-hotspots-ranking__folder-icon').length).toBe(0);
  });

  it('restores the saved scroll position when switching back to a mode', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    const scrollEl = container.querySelector('.adl-file-hotspots-ranking__scroll') as HTMLElement;
    expect(scrollEl).toBeTruthy();

    // scroll full mode to 120
    scrollEl.scrollTop = 120;
    fireEvent.scroll(scrollEl);
    expect(scrollEl.scrollTop).toBe(120);

    // switch to drill: no saved drill scroll yet, resets to 0
    fireEvent.click(screen.getByText('Level Drill'));
    expect(scrollEl.scrollTop).toBe(0);

    // scroll drill mode to 80
    scrollEl.scrollTop = 80;
    fireEvent.scroll(scrollEl);
    expect(scrollEl.scrollTop).toBe(80);

    // switch back to full: restores full's saved scroll (120)
    fireEvent.click(screen.getByText('Global Ranking'));
    expect(scrollEl.scrollTop).toBe(120);

    // switch back to drill: restores drill's saved scroll (80)
    fireEvent.click(screen.getByText('Level Drill'));
    expect(scrollEl.scrollTop).toBe(80);
  });

  it('dynamically adjusts the container height to the current row count', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    const scrollEl = container.querySelector('.adl-file-hotspots-ranking__scroll') as HTMLElement;

    // full mode: 3 files → 32px header + 96px rows = 128px
    expect(scrollEl.style.height).toBe('128px');

    fireEvent.click(screen.getByText('Level Drill'));
    // drill root: 2 dirs → 32px header + 64px rows = 96px
    expect(scrollEl.style.height).toBe('96px');

    // drill into src: 2 dirs (core, api) → still 96px
    fireEvent.click(getRows(container)[0]); // src
    expect(scrollEl.style.height).toBe('96px');

    // drill into core: 1 file → 32px header + 32px = 64px
    fireEvent.click(getRows(container)[0]); // core
    expect(scrollEl.style.height).toBe('64px');

    // back to full mode restores 128px
    fireEvent.click(screen.getByText('Global Ranking'));
    expect(scrollEl.style.height).toBe('128px');
  });

  it('scrolls the outer git-vis area to the bottom when the chart height changes', () => {
    const { container } = render(
      <div className="adl-git-vis__container">
        <FileHotspotsLeaderboard data={fileHotspotsMockData} />
      </div>,
    );
    const outer = container.querySelector('.adl-git-vis__container') as HTMLElement;
    Object.defineProperty(outer, 'scrollHeight', { value: 600, configurable: true });
    Object.defineProperty(outer, 'clientHeight', { value: 300, configurable: true });
    outer.scrollTop = 0;

    fireEvent.click(screen.getByText('Level Drill'));
    expect(outer.scrollTop).toBe(300); // scrollHeight - clientHeight
  });

  it('opens the tree card via the jump button without drilling the row', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    fireEvent.click(screen.getByText('Level Drill'));

    const jumpBtns = container.querySelectorAll('.adl-file-hotspots-ranking__jump-btn');
    expect(jumpBtns.length).toBeGreaterThan(0);
    const jumpCell = jumpBtns[0].closest('.adl-file-hotspots-ranking__cell--jump');
    expect(jumpCell).not.toBeNull();
    const row = getRows(container)[0];
    const cells = Array.from(row.querySelectorAll('.adl-file-hotspots-ranking__cell'));
    expect(cells.indexOf(jumpCell as HTMLElement)).toBeLessThan(
      cells.indexOf(row.querySelector('.adl-file-hotspots-ranking__cell--rank') as HTMLElement),
    );

    fireEvent.click(jumpBtns[0]); // src row
    expect(screen.getByTestId('tree-card')).toBeTruthy();
    expect(getRowNames(container)).toEqual(['src', 'tests']);

    fireEvent.click(screen.getByText('Jump'));
    expect(getRowNames(container)).toEqual(['engine.ts']);
  });

  it('copies the name and full path via row hover buttons', () => {
    const { container } = render(<FileHotspotsLeaderboard data={fileHotspotsMockData} />);
    const writeText = vi.mocked(navigator.clipboard.writeText);

    const nameCopy = container.querySelector(
      '.adl-file-hotspots-ranking__cell--name .adl-copy-btn',
    ) as HTMLElement;
    expect(nameCopy).toBeTruthy();
    fireEvent.click(nameCopy);
    expect(writeText).toHaveBeenCalledWith('engine.ts');

    const pathCopy = container.querySelector(
      '.adl-file-hotspots-ranking__cell--path .adl-copy-btn',
    ) as HTMLElement;
    expect(pathCopy).toBeTruthy();
    fireEvent.click(pathCopy);
    expect(writeText).toHaveBeenCalledWith('src/core/engine.ts');
  });
});
