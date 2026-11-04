import { describe, it, expect } from 'vitest';
import { runWithConcurrency } from '../asyncUtils';

describe('runWithConcurrency', () => {
  it('should process all items', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runWithConcurrency(items, 2, async (n) => n * 2);
    const values = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<number>).value);
    expect(values).toEqual([2, 4, 6, 8, 10]);
  });

  it('should limit concurrency', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const items = [1, 2, 3, 4, 5, 6];

    await runWithConcurrency(items, 2, async (n) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return n;
    });

    expect(maxConcurrent).toBe(2);
  });

  it('should handle empty array', async () => {
    const results = await runWithConcurrency([], 5, async () => 'x');
    expect(results).toEqual([]);
  });

  it('should handle rejected promises', async () => {
    const items = [1, 2, 3];
    const results = await runWithConcurrency(items, 2, async (n) => {
      if (n === 2) {
        throw new Error('fail');
      }
      return n;
    });
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');
  });

  it('should fall back to full concurrency when concurrency >= items.length', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const items = [1, 2, 3];

    await runWithConcurrency(items, 10, async (n) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return n;
    });

    expect(maxConcurrent).toBe(3);
  });
});
