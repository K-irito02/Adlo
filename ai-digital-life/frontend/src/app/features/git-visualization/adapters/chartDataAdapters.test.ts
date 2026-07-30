import { describe, it, expect } from 'vitest';
import { codeEvolutionToAreaData } from './chartDataAdapters';

describe('codeEvolutionToAreaData', () => {
  it('preserves full date (YYYY-MM-DD) in output', () => {
    const input = [
      { weekStart: '2024-01-07', additions: 100, deletions: 50 },
      { weekStart: '2024-06-15', additions: 200, deletions: 80 },
      { weekStart: '2025-03-01', additions: 150, deletions: 60 },
    ];
    const result = codeEvolutionToAreaData(input);
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2024-01-07');
    expect(result[1].date).toBe('2024-06-15');
    expect(result[2].date).toBe('2025-03-01');
  });

  it('handles empty input', () => {
    expect(codeEvolutionToAreaData([])).toEqual([]);
  });
});
