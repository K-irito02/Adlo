import type { ConnectionTestResult, ProviderStatus } from './ipc/provider';

export type ConnectionTestMap = Record<string, ConnectionTestResult | undefined>;

// Weight tiers are deliberately disjoint (4 > 2 + 1, 2 > 1) so the sort is a
// strict priority: enabled > has stored key > successfully tested.
const RANK_ENABLED = 4;
const RANK_HAS_KEY = 2;
const RANK_TESTED = 1;

function providerRank(p: ProviderStatus, tests: ConnectionTestMap): number {
  let rank = 0;
  if (p.enabled) {
    rank += RANK_ENABLED;
  }
  if (p.hasKey) {
    rank += RANK_HAS_KEY;
  }
  if (tests[p.id]?.connected === true) {
    rank += RANK_TESTED;
  }
  return rank;
}

/**
 * Sort providers for the settings panel so that usable/active providers surface
 * first: enabled, then providers with a stored key, then providers that passed a
 * connection test. Uses a stable sort, so equal-rank providers keep the
 * underlying (deterministic registration) order.
 */
export function sortProvidersForDisplay(
  providers: ProviderStatus[],
  connectionTestResults: ConnectionTestMap = {},
): ProviderStatus[] {
  return [...providers].sort((a, b) => {
    const rankA = providerRank(a, connectionTestResults);
    const rankB = providerRank(b, connectionTestResults);
    return rankB - rankA;
  });
}
