import { describe, it, expect } from 'vitest';
import { getBranchColor } from './branchColor';
import { hslToHex } from './hslToHex';

describe('getBranchColor', () => {
  it('returns fixed color for main branch', () => {
    expect(getBranchColor('main', ['main', 'feature-1'])).toBe('#3b82f6');
  });

  it('returns fixed color for master branch', () => {
    expect(getBranchColor('master', ['master'])).toBe('#3b82f6');
  });

  it('returns fixed color for develop branch', () => {
    expect(getBranchColor('develop', ['main', 'develop'])).toBe('#06b6d4');
  });

  it('returns fixed color for release branch', () => {
    expect(getBranchColor('release', ['main', 'release'])).toBe('#8b5cf6');
  });

  it('returns fixed color for hotfix branch', () => {
    expect(getBranchColor('hotfix', ['main', 'hotfix'])).toBe('#ef4444');
  });

  it('returns HSL color for non-fixed branch', () => {
    const allBranches = ['main', 'feature-a'];
    const color = getBranchColor('feature-a', allBranches);
    const expectedHue = (0 / 1) * 360;
    expect(color).toBe(hslToHex(expectedHue, 70, 50));
  });

  it('distributes hues evenly for multiple non-fixed branches', () => {
    const allBranches = ['main', 'feature-a', 'feature-b', 'feature-c'];
    const colorA = getBranchColor('feature-a', allBranches);
    const colorB = getBranchColor('feature-b', allBranches);
    const colorC = getBranchColor('feature-c', allBranches);
    expect(colorA).not.toBe(colorB);
    expect(colorB).not.toBe(colorC);
    expect(colorA).not.toBe(colorC);
  });

  it('returns fallback color for unknown branch', () => {
    expect(getBranchColor('unknown', ['main'])).toBe('#94a3b8');
  });

  it('handles single non-fixed branch (hue=0)', () => {
    const color = getBranchColor('feature-a', ['feature-a']);
    expect(color).toBe(hslToHex(0, 70, 50));
  });

  it('handles all fixed branches (no non-fixed)', () => {
    expect(getBranchColor('main', ['main', 'develop', 'release'])).toBe('#3b82f6');
  });
});

describe('hslToHex', () => {
  it('converts red (0, 100%, 50%)', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
  });

  it('converts green (120, 100%, 50%)', () => {
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
  });

  it('converts blue (240, 100%, 50%)', () => {
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });
});
