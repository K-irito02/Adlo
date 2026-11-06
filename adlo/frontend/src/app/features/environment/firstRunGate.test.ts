import { describe, expect, it } from 'vitest';
import { shouldShowAutomaticFirstRunWizard } from './firstRunGate';

describe('shouldShowAutomaticFirstRunWizard', () => {
  it('shows only after resolution and before completion', () => {
    expect(shouldShowAutomaticFirstRunWizard({ resolved: false, done: false, skip: false })).toBe(
      false,
    );
    expect(shouldShowAutomaticFirstRunWizard({ resolved: true, done: false, skip: false })).toBe(
      true,
    );
    expect(shouldShowAutomaticFirstRunWizard({ resolved: true, done: true, skip: false })).toBe(
      false,
    );
  });

  it('lets the dev-only skip flag suppress the automatic wizard', () => {
    expect(shouldShowAutomaticFirstRunWizard({ resolved: true, done: false, skip: true })).toBe(
      false,
    );
  });
});
