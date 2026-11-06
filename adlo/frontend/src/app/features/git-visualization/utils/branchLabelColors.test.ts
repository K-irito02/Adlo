import { describe, expect, it } from 'vitest';
import {
  BRANCH_COLOR_SLOT_COUNT,
  assignBranchColorSlots,
  buildRefLabelColorMap,
  branchColorSlotVar,
  getRefLabelColor,
} from './branchLabelColors';

describe('assignBranchColorSlots', () => {
  it('assigns a different slot to every current branch', () => {
    const names = [
      'main',
      'slot-1',
      'slot-2',
      'refactor/strip-20260903',
      'remove-communicate-panel',
    ];
    const slots = assignBranchColorSlots(names);

    expect(Object.keys(slots).sort()).toEqual([...names].sort());
    expect(new Set(Object.values(slots)).size).toBe(names.length);
  });

  it('keeps existing colors when a branch is added', () => {
    // archive occupies remove's preferred slot, so remove is placed on slot 1.
    // b6 sorts before remove and also prefers slot 1 — without preserving the
    // previous assignment, remove would be moved to another slot.
    const before = assignBranchColorSlots([
      'main',
      'archive/full-20260903',
      'remove-communicate-panel',
    ]);
    expect(before['remove-communicate-panel']).toBe(1);

    const after = assignBranchColorSlots(
      ['main', 'archive/full-20260903', 'remove-communicate-panel', 'b6'],
      before,
    );

    for (const name of Object.keys(before)) {
      expect(after[name]).toBe(before[name]);
    }
    expect(after.b6).toBeTypeOf('number');
    expect(new Set(Object.values(after)).size).toBe(4);
  });

  it('keeps remaining colors when a branch is removed', () => {
    const before = assignBranchColorSlots([
      'main',
      'archive/full-20260903',
      'remove-communicate-panel',
    ]);
    const after = assignBranchColorSlots(['main', 'remove-communicate-panel'], before);

    expect(after.main).toBe(before.main);
    expect(after['remove-communicate-panel']).toBe(before['remove-communicate-panel']);
  });

  it('retains history so a returning branch reclaims its slot', () => {
    const all = assignBranchColorSlots([
      'main',
      'archive/full-20260903',
      'remove-communicate-panel',
    ]);
    const withoutArchive = assignBranchColorSlots(['main', 'remove-communicate-panel'], all);

    expect(withoutArchive['archive/full-20260903']).toBe(all['archive/full-20260903']);

    const returning = assignBranchColorSlots(
      ['main', 'archive/full-20260903', 'remove-communicate-panel'],
      withoutArchive,
    );
    expect(returning['archive/full-20260903']).toBe(all['archive/full-20260903']);
    expect(returning['remove-communicate-panel']).toBe(all['remove-communicate-panel']);
  });

  it('fills all slots before reusing one', () => {
    const names = Array.from({ length: BRANCH_COLOR_SLOT_COUNT }, (_, i) => `branch-${i}`);
    const slots = assignBranchColorSlots(names);

    expect(new Set(Object.values(slots)).size).toBe(BRANCH_COLOR_SLOT_COUNT);
  });

  it('filters remote branches and HEAD out of the assignment', () => {
    const slots = assignBranchColorSlots(['main', 'origin/main', 'upstream/main', 'HEAD']);

    expect(Object.keys(slots)).toEqual(['main']);
  });

  it('respects persisted slots instead of recomputing them by rank', () => {
    const previous = { main: 7, 'slot-1': 2 };
    const slots = assignBranchColorSlots(['main', 'slot-1'], previous);

    expect(slots.main).toBe(previous.main);
    expect(slots['slot-1']).toBe(previous['slot-1']);
  });

  it('supports a branch literally named __proto__', () => {
    const slots = assignBranchColorSlots(['__proto__', 'main']);

    expect(Object.prototype.hasOwnProperty.call(slots, '__proto__')).toBe(true);
    expect(new Set(Object.values(slots)).size).toBe(2);
  });

  it('avoids slots reserved by temporarily absent branches for new branches', () => {
    const slots = assignBranchColorSlots(['main', 'remove-communicate-panel'], {
      main: 0,
      ghost: 2,
    });

    expect(slots.ghost).toBe(2);
    expect(slots['remove-communicate-panel']).not.toBe(2);
  });

  it('keeps every current branch even when the history budget is exceeded', () => {
    const names = Array.from({ length: 205 }, (_, index) => `branch-${index}`);
    const before = assignBranchColorSlots(names);

    expect(Object.keys(before).sort()).toEqual([...names].sort());
    const after = assignBranchColorSlots(names, before);
    for (const name of names) {
      expect(after[name]).toBe(before[name]);
    }
  });

  it('does not displace existing branches once more than 12 share the palette', () => {
    const names = Array.from({ length: 13 }, (_, index) => `branch-${index}`);
    const before = assignBranchColorSlots(names);
    const after = assignBranchColorSlots([...names, 'branch-0a'], before);
    const afterRemoval = assignBranchColorSlots(
      names.filter((name) => name !== 'branch-0'),
      before,
    );

    // Add and remove paths must both keep every surviving assignment. The old
    // implementation reassigned branch-9 when one of the 13 was removed.
    for (const name of names) {
      expect(after[name]).toBe(before[name]);
    }
    for (const name of Object.keys(afterRemoval)) {
      expect(afterRemoval[name]).toBe(before[name]);
    }
    expect(after['branch-0a']).toBeTypeOf('number');
  });

  it('reuses a preferred slot after all 12 slots are taken', () => {
    const names = Array.from({ length: 13 }, (_, index) => `branch-${index}`);
    const firstTwelve = assignBranchColorSlots(names.slice(0, 12));
    const allThirteen = assignBranchColorSlots(names, firstTwelve);

    for (const name of names.slice(0, 12)) {
      expect(allThirteen[name]).toBe(firstTwelve[name]);
    }
    expect(allThirteen[names[12]]).toBeTypeOf('number');
  });

  it('drops out-of-range stored slots', () => {
    const previous = { main: 0, 'slot-1': 99, 'slot-2': -1 };
    const slots = assignBranchColorSlots(['main', 'slot-1', 'slot-2'], previous);

    expect(Object.keys(slots)).toHaveLength(3);
    expect(Object.values(slots).every((slot) => slot >= 0 && slot < BRANCH_COLOR_SLOT_COUNT)).toBe(
      true,
    );
  });

  it('preserves duplicate stored slots so colors stay stable', () => {
    const slots = assignBranchColorSlots(['main', 'slot-1'], { main: 0, 'slot-1': 0 });

    expect(slots.main).toBe(0);
    expect(slots['slot-1']).toBe(0);
  });
});

describe('branch color map', () => {
  it('maps branches to the CSS palette variables', () => {
    const map = buildRefLabelColorMap(['main', 'slot-1']);

    expect(map.get('main')).toMatch(/^var\(--branch-color-\d{2}, .+\)$/);
    expect(map.get('slot-1')).toMatch(/^var\(--branch-color-\d{2}, .+\)$/);
    expect(map.get('main')).not.toBe(map.get('slot-1'));
  });

  it('gives the previously near-identical slot-1 / slot-2 different colors', () => {
    const map = buildRefLabelColorMap(['slot-1', 'slot-2']);

    expect(map.get('slot-1')).not.toBe(map.get('slot-2'));
  });

  it('falls back deterministically when no map is supplied', () => {
    expect(getRefLabelColor('main')).toBe(getRefLabelColor('main'));
    expect(getRefLabelColor('main')).toMatch(/^var\(--branch-color-\d{2}, .+\)$/);
  });

  it('normalizes slot numbers into the palette range', () => {
    expect(branchColorSlotVar(0)).toContain('--branch-color-01');
    expect(branchColorSlotVar(BRANCH_COLOR_SLOT_COUNT)).toContain('--branch-color-01');
    expect(branchColorSlotVar(-1)).toContain('--branch-color-12');
    expect(branchColorSlotVar(Number.NaN)).toContain('--branch-color-01');
  });
});
