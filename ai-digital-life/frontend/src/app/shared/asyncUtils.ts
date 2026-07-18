export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = { status: 'fulfilled' as const, value: await fn(items[i]) };
      } catch (e) {
        results[i] = { status: 'rejected' as const, reason: e };
      }
    }
  }

  const count = Math.min(concurrency, items.length);
  const workers = Array.from({ length: count }, () => worker());
  await Promise.all(workers);
  return results;
}
