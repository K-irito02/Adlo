# Branch Graph Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Branch Graph visualization with: centered bottom message, lane max-width + scroll + sticky tag row + panel sync, date format change, native tooltip → TooltipSimple sub-card with Gravatar avatars, and debug logging for missing branch investigation.

**Architecture:** Restructure the BranchGraph layout from a single CSS grid to a two-panel flex layout inside a shared scroll container. Add a `CommitTooltipUtils` module for date formatting/MD5/Gravatar. Use the existing `TooltipSimple` component for the rich tooltip card.

**Tech Stack:** React 19, TypeScript, Zustand, CSS custom properties, TooltipSimple (project component), Intl.DateTimeFormat, Gravatar API

## Global Constraints

- All new CSS classes use `adl-branch-graph__` prefix convention
- Gravatar is the only avatar source; no additional API dependency
- MD5 implemented as pure JS (no npm package), written inline in `commitTooltipUtils.ts`
- Date formatting uses `Intl.DateTimeFormat` with current locale, no new i18n keys
- Tests follow existing pattern: vitest + `@testing-library/react`
- TDD: write test first, then implementation

---

### Task 1: Create utility functions (formatDate, getGravatarUrl, md5)

**Files:**
- Create: `frontend/src/app/features/git-visualization/utils/commitTooltipUtils.ts`
- Test: `frontend/src/app/features/git-visualization/utils/commitTooltipUtils.test.ts`

**Interfaces:**
- Produces:
  - `formatDate(dateStr: string, locale: string, mode: 'table' | 'tooltip'): string`
  - `getGravatarUrl(email: string, size: number): string`
  - `md5(str: string): string`

- [ ] **Step 1: Write the failing tests**

```typescript
// commitTooltipUtils.test.ts
import { describe, it, expect } from 'vitest';
import { formatDate, getGravatarUrl, md5 } from './commitTooltipUtils';

describe('md5', () => {
  it('produces correct MD5 hash for known input', () => {
    // MD5 of "hello" = 5d41402abc4b2a76b9719d911017c592
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('handles empty string', () => {
    // MD5 of "" = d41d8cd98f00b204e9800998ecf8427e
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('handles special characters', () => {
    expect(md5('test@example.com')).toBeTruthy();
    expect(md5('test@example.com').length).toBe(32);
  });
});

describe('getGravatarUrl', () => {
  it('generates correct Gravatar URL', () => {
    // MD5 of "alex@example.com" (lowercased, trimmed)
    // Pre-computed: md5('alex@example.com')
    const md5Hash = md5('alex@example.com');
    expect(getGravatarUrl('alex@example.com', 32)).toBe(
      `https://www.gravatar.com/avatar/${md5Hash}?s=32&d=identicon`
    );
  });

  it('lowercases and trims email before hashing', () => {
    const url1 = getGravatarUrl('Alex@Example.com', 32);
    const url2 = getGravatarUrl('alex@example.com', 32);
    expect(url1).toBe(url2);
  });

  it('uses default size 80 when not specified', () => {
    const url = getGravatarUrl('test@test.com');
    expect(url).toContain('?s=80');
  });
});

describe('formatDate', () => {
  it('formats in table mode as "HH:mm DD-MM-YYYY"', () => {
    const result = formatDate('2026-07-28T14:30:00', 'en-US', 'table');
    // Expected: "14:30 28-07-2026"
    expect(result).toBe('14:30 28-07-2026');
  });

  it('formats in tooltip mode with natural date', () => {
    const result = formatDate('2026-07-28T14:30:00', 'en-US', 'tooltip');
    // Expected format like "July 28, 2026 at 14:30:00"
    expect(result).toContain('2026');
    expect(result).toContain('28');
  });

  it('falls back gracefully for invalid date', () => {
    const result = formatDate('invalid', 'en-US', 'table');
    expect(result).toBe('--');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run frontend/src/app/features/git-visualization/utils/commitTooltipUtils.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the minimal implementation**

```typescript
// commitTooltipUtils.ts

/** Pure JS MD5 implementation (no external deps) */
export function md5(str: string): string {
  const rotateLeft = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  const addUnsigned = (x: number, y: number) => (x + y) >>> 0;
  const hex = (v: number) => {
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += '0123456789abcdef'.charAt((v >> (i * 8 + 4)) & 0x0f) +
           '0123456789abcdef'.charAt((v >> (i * 8)) & 0x0f);
    }
    return s;
  };

  const K = [0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
             0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
             0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
             0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
             0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
             0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
             0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
             0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
             0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
             0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
             0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
             0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
             0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
             0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
             0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
             0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391];

  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
             5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
             4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
             6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];

  let bits: number[] = [];
  const len = str.length;
  for (let i = 0; i < len; i++) {
    bits.push(str.charCodeAt(i));
  }
  bits.push(0x80);
  while (bits.length % 64 !== 56) {
    bits.push(0);
  }
  const bitLenLow = (len * 8) >>> 0;
  const bitLenHigh = Math.floor((len * 8) / 0x100000000);
  for (let i = 0; i < 4; i++) {
    bits.push((bitLenLow >>> (i * 8)) & 0xff);
  }
  for (let i = 0; i < 4; i++) {
    bits.push((bitLenHigh >>> (i * 8)) & 0xff);
  }
  if (bits.length % 64 !== 0) {
    bits.push(0);
  }

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476;

  for (let chunkStart = 0; chunkStart < bits.length; chunkStart += 64) {
    const X: number[] = [];
    for (let i = 0; i < 16; i++) {
      X[i] = bits[chunkStart + i * 4] |
             (bits[chunkStart + i * 4 + 1] << 8) |
             (bits[chunkStart + i * 4 + 2] << 16) |
             (bits[chunkStart + i * 4 + 3] << 24);
    }

    let A = h0, B = h1, C = h2, D = h3;

    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + X[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotateLeft(F, S[i])) >>> 0;
    }
    h0 = addUnsigned(h0, A);
    h1 = addUnsigned(h1, B);
    h2 = addUnsigned(h2, C);
    h3 = addUnsigned(h3, D);
  }

  return hex(h0) + hex(h1) + hex(h2) + hex(h3);
}

/** Generate a Gravatar URL from an email address */
export function getGravatarUrl(email: string, size = 80): string {
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}

/** Format a date string for display */
export function formatDate(dateStr: string, locale: string, mode: 'table' | 'tooltip'): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return '--';
  }

  if (mode === 'table') {
    // "HH:mm DD-MM-YYYY"
    const parts = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(d);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

    const time = `${get('hour')}:${get('minute')}`;
    const day = get('day');
    const month = get('month');
    const year = get('year');

    return `${time} ${day}-${month}-${year}`;
  }

  // tooltip mode: natural full date
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'medium',
  }).format(d);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir frontend run test -- --run frontend/src/app/features/git-visualization/utils/commitTooltipUtils.test.ts`
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/git-visualization/utils/commitTooltipUtils.ts frontend/src/app/features/git-visualization/utils/commitTooltipUtils.test.ts
git commit -m "feat(branch-graph): add commitTooltipUtils (formatDate, getGravatarUrl, md5)"
```

---

### Task 2: Restructure BranchGraph layout (flex panels, sticky tag row, scroll container, bottom bar)

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/git-visualization.css`
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx:522-767`
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx`

**Interfaces:**
- Consumes: Task 1 (none directly — pure CSS + JSX restructure)
- Produces: New CSS classes that Task 4 and Task 5 depend on

- [ ] **Step 1: Write failing tests** — Update existing tests to expect new DOM structure

The existing tests query for `.adl-branch-graph__row`, `.adl-branch-graph__svg`, `.adl-branch-graph__label` — these CSS class selectors remain unchanged. The tests should still pass with the new layout. No new failing tests needed for layout.

- [ ] **Step 2: Add CSS for new layout**

In `git-visualization.css`, after the existing `.adl-branch-graph__header` block, add:

```css
/* ── Branch Graph Panels Layout ── */
.adl-branch-graph__body {
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.adl-branch-graph__body[data-scrolling],
.adl-branch-graph__body[data-scrollbar-near] {
  scrollbar-color: var(--border-default) transparent;
}
.adl-branch-graph__body::-webkit-scrollbar {
  width: 6px;
}
.adl-branch-graph__body::-webkit-scrollbar-track {
  background: transparent;
}
.adl-branch-graph__body::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 999px;
}
.adl-branch-graph__body[data-scrolling]::-webkit-scrollbar-thumb,
.adl-branch-graph__body[data-scrollbar-near]::-webkit-scrollbar-thumb {
  background: var(--border-default);
}

.adl-branch-graph__tag-row--sticky {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg);
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  gap: 6px;
  padding: 6px 8px 8px 8px;
  padding-right: 24px;
  min-height: 34px;
  border-bottom: 1px solid var(--border-subtle);
}
.adl-branch-graph__tag-row--sticky::-webkit-scrollbar {
  display: none;
}

.adl-branch-graph__panels {
  display: flex;
  flex: 1;
  min-height: 0;
}

.adl-branch-graph__lanes-panel {
  overflow-x: auto;
  overflow-y: hidden;
  max-width: 400px;
  flex-shrink: 0;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.adl-branch-graph__lanes-panel[data-scrolling],
.adl-branch-graph__lanes-panel[data-scrollbar-near] {
  scrollbar-color: var(--border-default) transparent;
}
.adl-branch-graph__lanes-panel::-webkit-scrollbar {
  height: 6px;
}
.adl-branch-graph__lanes-panel::-webkit-scrollbar-track {
  background: transparent;
}
.adl-branch-graph__lanes-panel::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 999px;
}
.adl-branch-graph__lanes-panel[data-scrolling]::-webkit-scrollbar-thumb,
.adl-branch-graph__lanes-panel[data-scrollbar-near]::-webkit-scrollbar-thumb {
  background: var(--border-default);
}

.adl-branch-graph__table-panel {
  flex: 1;
  min-width: 0;
  overflow: visible;
}

.adl-branch-graph__bottom-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px 0;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg);
  border-top: 1px solid var(--border-subtle);
  z-index: 5;
}
```

- [ ] **Step 3: Restructure BranchGraph render**

In `BranchGraph.tsx`, replace the JSX return block (lines 522-767) with:

```tsx
return (
  <div className="adl-git-vis__chart" ref={chartContainerRef} style={{ overflowX: 'hidden' }}>
    <div className="adl-branch-graph__body" ref={scrollBodyRef}>
      {/* Tag row — sticky top, spans full width */}
      <div ref={tagRowRef} className="adl-branch-graph__tag-row--sticky" onWheel={handleTagRowWheel}>
        {columnsWithLabels.map((col) => {
          const fcs: number[] = col.filterCols ?? [col.index];
          const isSelected = fcs.some((i) => filterColumns.has(i));
          const isHovered = hoveredLabel === col.label;
          const showIndicator = isSelected || isHovered;
          const showScale = (isHovered && !isSelected) || (!isHovered && isSelected);
          return (
            <div key={`col-${col.index}`} className="adl-branch-graph__label-drag" style={{ opacity: 1 }}>
              <button
                className="adl-branch-graph__label"
                data-indicator={showIndicator ? 'true' : undefined}
                data-scale={showScale ? 'true' : undefined}
                onClick={() => handleLabelClick(fcs)}
                onMouseEnter={() => setHoveredLabel(col.label ?? null)}
                onMouseLeave={() => setHoveredLabel(null)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 0,
                  background: col.color,
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  lineHeight: 1,
                  opacity: filterColumns.size === 0 || fcs.some((i) => filterColumns.has(i)) ? 1 : 0.4,
                }}
              >
                <span
                  className="adl-branch-graph__label-text"
                  title={
                    col.branchProgress
                      ? col.branchProgress.mergeBase
                        ? t.gitVisProgressTooltip
                            .replace('{label}', col.label ?? '')
                            .replace('{ahead}', String(col.branchProgress.ahead))
                            .replace('{behind}', String(col.branchProgress.behind)) +
                          ' | ' +
                          t.gitVisProgressBase +
                          ': ' +
                          col.branchProgress.mergeBase.substring(0, 7)
                        : (col.label ?? '') + ' — ' + t.gitVisLocalOnly
                      : (col.label ?? '')
                  }
                >
                  {col.label ?? ''}
                </span>
                {col.branchProgress?.mergeBase ? (
                  <span className="adl-branch-graph__label-progress" style={{ marginLeft: 2 }}>
                    {col.branchProgress.ahead > 0 && (
                      <span><span style={{ fontSize: 16, fontWeight: 700 }}>↑</span><span style={{ fontSize: 11 }}>{col.branchProgress.ahead}</span></span>
                    )}
                    {col.branchProgress.behind > 0 && (
                      <span><span style={{ fontSize: 16, fontWeight: 700 }}>↓</span><span style={{ fontSize: 11 }}>{col.branchProgress.behind}</span></span>
                    )}
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>

      {/* Panels: lanes + table, same vertical scroll parent */}
      <div className="adl-branch-graph__panels">
        <div className="adl-branch-graph__lanes-panel">
          <div className="adl-branch-graph__header" style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 120px 100px',
            gap: 8,
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: theme.muted,
            borderBottom: `1px solid ${theme.grid}`,
          }}>
            <span>{t.gitVisHash}</span>
            <span>{t.gitVisMessage}</span>
            <span>{t.gitVisAuthor}</span>
            <span>{t.gitVisDate}</span>
          </div>
          <SvgLanes
            rows={visibleRows}
            columns={columns}
            edges={adapted?.edges ?? []}
            totalWidth={totalLaneWidth}
            totalHeight={totalHeight}
            hoveredId={hoveredId}
            nodeStroke={nodeStroke}
            filterColumns={filterColumns}
            hoveredBranch={hoveredLabel}
            aheadRows={aheadRows}
          />
        </div>
        <div className="adl-branch-graph__table-panel">
          {visibleRows.map((row) => {
            const isFiltered = filterColumns.size > 0 && !filterColumns.has(row.column) && row.node.branch !== hoveredLabel;
            return (
              <div
                key={row.node.id}
                className={`adl-branch-graph__row${hoveredId === row.node.id ? ' adl-branch-graph__row--hover' : ''}${isFiltered ? ' adl-branch-graph__row--dimmed' : ''}`}
                data-branch={row.node.branch}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr 120px 100px',
                  gap: 8,
                  padding: '4px 8px',
                  fontSize: 12,
                  lineHeight: ROW_HEIGHT - 8 + 'px',
                  cursor: 'default',
                  borderRadius: 4,
                  opacity: isFiltered ? 0.25 : 1,
                  minHeight: ROW_HEIGHT,
                }}
                onMouseEnter={() => handleRowHover(row.node.id)}
                onMouseLeave={() => handleRowHover(null)}
              >
                {/* Row cells unchanged (copied from original) — see Task 4 & 5 for date/avatar changes */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', color: theme.text, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.node.shortHash || row.node.hash}
                  </span>
                  <span className="adl-branch-graph__copy-hash">
                    <CopyButton text={row.node.hash} size={11} tooltip={t.gitVisCopyHash} nativeTooltip />
                  </span>
                </span>
                <span style={{ color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {row.node.message}
                  {row.node.tag && (
                    <span className="adl-branch-graph__tag" style={{ marginLeft: 8, padding: '1px 4px', borderRadius: 2, background: row.color, color: '#fff', fontSize: 9, fontWeight: 600, lineHeight: 1 }}>
                      {row.node.tag}
                    </span>
                  )}
                </span>
                <span style={{ color: theme.muted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AuthorAvatar name={row.node.author} />
                  {row.node.author}
                </span>
                <span style={{ color: theme.muted }}>{formatRelativeDate(row.node.date)}</span>
              </div>
            );
          })}

          {/* Loading more sentinel */}
          {visibleCount < rows.length && (
            <div ref={sentinelRef} style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, color: theme.muted }}>
              {t.gitVisLoadingMore}
            </div>
          )}

          {/* All loaded bar */}
          {visibleCount >= rows.length && rows.length > INITIAL_LOAD && (
            <div className="adl-branch-graph__bottom-bar">
              {t.gitVisAllLoaded?.replace('{count}', String(rows.length))}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);
```

Add `scrollBodyRef`:
```typescript
const scrollBodyRef = useRef<HTMLDivElement>(null);
```

Remove the old `overflowX: 'hidden'` style from `chartContainerRef` and the old `adl-git-vis__chart` `max-height: 360px` should still apply from CSS.

Also need to move the scrollbar auto-hide listeners. Previously `GitVisualizationView` attached them to `.adl-git-vis__chart` elements. Since we now have `.adl-branch-graph__body` as the scroll container, check that the MutationObserver in `GitVisualizationView` still picks up the chart element. It should because `chartContainerRef` still has `adl-git-vis__chart` class.

- [ ] **Step 4: Run tests**

Run: `pnpm --dir frontend run test -- --run frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx`
Expected: PASS (existing tests adapted to new DOM structure)

If any tests fail due to structural changes, update selectors accordingly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/regions/rightpanel/git-visualization.css frontend/src/app/features/git-visualization/charts/BranchGraph.tsx frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx
git commit -m "feat(branch-graph): restructure layout — flex panels, sticky tag row, lane max-width, bottom bar"
```

---

### Task 3: Replace date format in BranchGraph

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx`

**Interfaces:**
- Consumes: `formatDate` from `commitTooltipUtils.ts` (Task 1)

- [ ] **Step 1: Add import for formatDate and locale**

At the top of `BranchGraph.tsx`, add:
```typescript
import { formatDate } from '../utils/commitTooltipUtils';
```

Get locale from `useTCopy` — check if `t._locale` or a similar locale property exists, or use `navigator.language`:
```typescript
const locale = navigator.language || 'en-US';
```

- [ ] **Step 2: Replace `formatRelativeDate` function** — Remove the old function (lines 772-790), it's no longer needed.

- [ ] **Step 3: Update the date cell in each row**

In the table row rendering, change:
```typescript
<span style={{ color: theme.muted }}>{formatRelativeDate(row.node.date)}</span>
```
to:
```typescript
<span style={{ color: theme.muted }}>{formatDate(row.node.date, locale, 'table')}</span>
```

- [ ] **Step 4: Run tests**

Run: `pnpm --dir frontend run test -- --run frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx`
Expected: PASS

Add a test verifying date format:
```typescript
it('displays date in table format', () => {
  const { container } = render(<BranchGraph data={mockData} />);
  const dateCells = container.querySelectorAll('.adl-branch-graph__row:first-child > span:last-child');
  expect(dateCells.length).toBe(1);
  expect(dateCells[0].textContent).toMatch(/^\d{2}:\d{2} \d{2}-\d{2}-\d{4}$/);
});
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/BranchGraph.tsx
git commit -m "feat(branch-graph): replace relative date with HH:mm DD-MM-YYYY format"
```

---

### Task 4: Add TooltipSimple sub-card with Gravatar avatars

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx`
- Modify: `frontend/src/styles/regions/rightpanel/git-visualization.css`

**Interfaces:**
- Consumes: `formatDate`, `getGravatarUrl` from `commitTooltipUtils.ts` (Task 1); new CSS classes (Task 2)

- [ ] **Step 1: Add imports**

```typescript
import { TooltipSimple } from '@components/Tooltip';
import { formatDate, getGravatarUrl } from '../utils/commitTooltipUtils';
```

- [ ] **Step 2: Write failing tests**

In `BranchGraph.test.tsx`, add:
```typescript
it('renders tooltip card content on row hover', () => {
  const { container } = render(<BranchGraph data={mockData} />);
  const rows = container.querySelectorAll('.adl-branch-graph__row');
  fireEvent.mouseEnter(rows[0]);
  // TooltipSimple renders via portal to document.body
  const tooltip = document.body.querySelector('[data-testid="tooltip-content"]');
  expect(tooltip).toBeTruthy();
  expect(tooltip?.textContent).toContain('a1a2a3'); // full hash
  expect(tooltip?.textContent).toContain('Initial project setup'); // commit message
  expect(tooltip?.textContent).toContain('Alex'); // author name
  expect(tooltip?.textContent).toContain('alex@example.com'); // author email
});

it('shows Gravatar image for author instead of initial when email is valid', () => {
  const { container } = render(<BranchGraph data={mockData} />);
  // Check the author column cells have img elements with gravatar src
  const imgs = container.querySelectorAll('.adl-author-avatar');
  const rowAvatar = imgs[0];
  // The first row author is Alex with email alex@example.com
  // Should have a gravatar URL
  expect(rowAvatar.getAttribute('src')).toMatch(/gravatar\.com\/avatar/);
});

it('shows author initial when image fails to load', () => {
  // Create a row with invalid email that will 404 on gravatar
  const dataWithBadEmail: RawBranchGraph = {
    ...mockData,
    nodes: [{ ...mockData.nodes[0], authorEmail: 'nonexistent@invalid.fake' }],
  };
  render(<BranchGraph data={dataWithBadEmail} />);
  // AuthorAvatar with onError should fallback to initials
  // We can't easily test onError in JSDOM, but we can verify the img element exists
  const imgs = document.querySelectorAll('.adl-author-avatar');
  expect(imgs.length).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Add CSS for tooltip card**

In `git-visualization.css`, add after the bottom-bar styles:

```css
/* ── Branch Graph Tooltip Card ── */
.adl-branch-graph__tooltip-card {
  padding: 12px;
  min-width: 320px;
  font-size: 12px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.adl-branch-graph__tooltip-divider {
  border: none;
  height: 1px;
  background: var(--border-subtle);
  margin: 0;
}

.adl-branch-graph__tooltip-hash {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-primary);
}

.adl-branch-graph__tooltip-hash .adl-branch-graph__copy-hash {
  opacity: 1;
  margin-left: auto;
}

.adl-branch-graph__tooltip-message {
  max-height: 216px; /* 12 lines × ~18px line-height */
  overflow-y: auto;
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.adl-branch-graph__tooltip-message:hover,
.adl-branch-graph__tooltip-message[data-scrolling] {
  scrollbar-color: var(--border-default) transparent;
}
.adl-branch-graph__tooltip-message::-webkit-scrollbar {
  width: 6px;
}
.adl-branch-graph__tooltip-message::-webkit-scrollbar-track {
  background: transparent;
}
.adl-branch-graph__tooltip-message::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 999px;
}
.adl-branch-graph__tooltip-message:hover::-webkit-scrollbar-thumb,
.adl-branch-graph__tooltip-message[data-scrolling]::-webkit-scrollbar-thumb {
  background: var(--border-default);
}

.adl-branch-graph__tooltip-author {
  display: flex;
  align-items: center;
  gap: 10px;
}

.adl-branch-graph__tooltip-author-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.adl-branch-graph__tooltip-author-name {
  font-weight: 600;
  font-size: 12px;
  color: var(--text-primary);
}

.adl-branch-graph__tooltip-author-email {
  font-size: 11px;
  color: var(--text-muted);
}

.adl-branch-graph__tooltip-date {
  font-size: 11px;
  color: var(--text-muted);
}
```

- [ ] **Step 4: Create CommitTooltipCard component**

Add this component in `BranchGraph.tsx` before the `BranchGraph` main component:

```typescript
// ── Commit Tooltip Card ──

interface CommitTooltipCardProps {
  hash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
}

const CommitTooltipCard = React.memo(function CommitTooltipCard({
  hash,
  message,
  author,
  authorEmail,
  date,
}: CommitTooltipCardProps) {
  const { t } = useTCopy();
  const locale = navigator.language || 'en-US';

  return (
    <div className="adl-branch-graph__tooltip-card">
      {/* Row 1: Full hash + copy */}
      <div className="adl-branch-graph__tooltip-hash">
        {hash}
        <span className="adl-branch-graph__copy-hash">
          <CopyButton text={hash} size={11} tooltip={t.gitVisCopyHash} nativeTooltip />
        </span>
      </div>

      <hr className="adl-branch-graph__tooltip-divider" />

      {/* Row 2: Commit message (scrollable, max 12 lines) */}
      <div className="adl-branch-graph__tooltip-message">
        {message}
      </div>

      <hr className="adl-branch-graph__tooltip-divider" />

      {/* Row 3: Author with Gravatar */}
      <div className="adl-branch-graph__tooltip-author">
        <AuthorAvatar name={author} src={getGravatarUrl(authorEmail, 32)} size={32} />
        <div className="adl-branch-graph__tooltip-author-info">
          <span className="adl-branch-graph__tooltip-author-name">{author}</span>
          <span className="adl-branch-graph__tooltip-author-email">{authorEmail}</span>
        </div>
      </div>

      <hr className="adl-branch-graph__tooltip-divider" />

      {/* Row 4: Full date */}
      <div className="adl-branch-graph__tooltip-date">
        {formatDate(date, locale, 'tooltip')}
      </div>
    </div>
  );
});
```

- [ ] **Step 5: Update AuthorAvatar to support Gravatar src with fallback**

The current `AuthorAvatar` accepts `src` prop and renders `<img>` when provided. Add `useState` for error state to properly handle image load failure with React state:

Modify the `AuthorAvatar` component — add `useState` and change the render logic:

```typescript
import React, { useState } from 'react';

const AuthorAvatar = React.memo(function AuthorAvatar({ name, src, size = 20 }: AuthorAvatarProps) {
  const bgColor = getAuthorColor(name);
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const [imgError, setImgError] = useState(false);

  if (src && !imgError) {
    return (
      <img
        className="adl-author-avatar"
        src={src}
        alt={name}
        onError={() => setImgError(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      className="adl-author-avatar"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bgColor,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.55),
        fontWeight: 600,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
});
```

- [ ] **Step 6: Wrap table rows with TooltipSimple**

Replace each row's wrapping div. Instead of:
```tsx
<div
  key={row.node.id}
  className={`...`}
  onMouseEnter={() => handleRowHover(row.node.id)}
  onMouseLeave={() => handleRowHover(null)}
>
  {/* row cells */}
</div>
```

Wrap the content with `TooltipSimple`:
```tsx
<TooltipSimple
  key={row.node.id}
  content={
    <CommitTooltipCard
      hash={row.node.hash}
      message={row.node.message}
      author={row.node.author}
      authorEmail={row.node.authorEmail}
      date={row.node.date}
    />
  }
  placement="right"
  dismissible
  showArrow
  maxWidth={400}
>
  <div
    className={`adl-branch-graph__row${hoveredId === row.node.id ? ' adl-branch-graph__row--hover' : ''}${isFiltered ? ' adl-branch-graph__row--dimmed' : ''}`}
    data-branch={row.node.branch}
    style={{
      display: 'grid',
      gridTemplateColumns: '80px 1fr 120px 100px',
      gap: 8,
      padding: '4px 8px',
      fontSize: 12,
      lineHeight: ROW_HEIGHT - 8 + 'px',
      cursor: 'default',
      borderRadius: 4,
      opacity: isFiltered ? 0.25 : 1,
      minHeight: ROW_HEIGHT,
    }}
    onMouseEnter={() => handleRowHover(row.node.id)}
    onMouseLeave={() => handleRowHover(null)}
  >
    {/* row cells unchanged */}
  </div>
</TooltipSimple>
```

**Important**: `TooltipSimple` handles its own mouse enter/leave events for tooltip trigger. The existing `onMouseEnter`/`onMouseLeave` for row highlighting will still work because they fire on the child div directly. However, we need to be careful — `TooltipSimple` merges events via `TooltipTrigger`. The row's `onMouseEnter`/`onMouseLeave` should be on the direct child element (the div), not on `TooltipTrigger`.

In the current `TooltipSimple` pattern, `TooltipTrigger` wraps the child and forwards events. When we pass `onMouseEnter` on the child div, `TooltipTrigger` will call both the tooltip handler and the child's handler. So both row highlighting and tooltip will work.

But there's a subtlety: we still want `handleRowHover` to work for SVG dimming effects. The original had `onMouseEnter`/`onMouseLeave` on the row div. With TooltipSimple, removing the `title` attribute is the main change.

- [ ] **Step 7: Update table author column to use Gravatar**

In the author cell, change:
```tsx
<AuthorAvatar name={row.node.author} />
```
to:
```tsx
<AuthorAvatar name={row.node.author} src={getGravatarUrl(row.node.authorEmail, 20)} />
```

- [ ] **Step 8: Remove the native `title` attribute from each row** — the line with `title={`${row.node.hash}\n...`}` should be removed.

- [ ] **Step 9: Run tests**

Run: `pnpm --dir frontend run test -- --run frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/BranchGraph.tsx frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "feat(branch-graph): add TooltipSimple sub-card with Gravatar avatars and full dates"
```

---

### Task 5: Add debug logging for missing branch investigation

**Files:**
- Modify: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx`

- [ ] **Step 1: Add debug logs**

In the `BranchGraph` component, after the adapted data is computed:

```typescript
const adapted = useMemo(() => (data ? adaptBranchGraphData(data) : null), [data]);

// Debug: log branches from backend
if (adapted) {
  console.log('[ADL-DEBUG] allBranches from backend:', adapted.allBranches);
}
```

After `columnsWithLabels` is computed:

```typescript
const columnsWithLabels = useMemo((): LabelColumnInfo[] => {
  // ... existing code ...
}, [columns, rows, adapted]);

// Debug: log label columns
if (columnsWithLabels.length > 0) {
  console.log('[ADL-DEBUG] label columns:', columnsWithLabels.map((c) => ({ label: c.label, index: c.index, filterCols: c.filterCols })));
}
```

- [ ] **Step 2: Run tests** (no test changes needed — debug logging doesn't affect behavior)

Run: `pnpm --dir frontend run test -- --run frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx`
Expected: PASS

- [ ] **Step 3: Manually verify in browser/desktop app**

Open the app and navigate to Git Visualization. Check the console output:
1. Find `[ADL-DEBUG] allBranches from backend:` — verify `feat/opencode-integration-fix` is listed
2. Find `[ADL-DEBUG] label columns:` — check if the branch appears as a label

If the branch appears in `allBranches` but not in `label columns`, the bug is in the label extraction/dedup logic in `columnsWithLabels`. If it doesn't appear in `allBranches`, the bug is in the Rust backend.

**After investigation, remove the debug logs before merging.**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/git-visualization/charts/BranchGraph.tsx
git commit -m "chore(branch-graph): add debug logging for missing branch investigation"
```
