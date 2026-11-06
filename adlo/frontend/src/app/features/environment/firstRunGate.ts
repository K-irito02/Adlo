export interface AutomaticFirstRunGateInput {
  resolved: boolean;
  done: boolean;
  skip: boolean;
}

/** Automatic first-run wizard gate; explicit "continue wizard" requests bypass it. */
export function shouldShowAutomaticFirstRunWizard({
  resolved,
  done,
  skip,
}: AutomaticFirstRunGateInput): boolean {
  return resolved && !done && !skip;
}
