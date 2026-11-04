import { useEffect, useState, useRef } from 'react';

interface YearBounds {
  min: number;
  max: number;
}

const cache = new Map<string, Promise<number | null>>();
const MAX_CACHE_SIZE = 20;

export function useYearBounds(rootPath: string): {
  yearBounds: YearBounds | null;
  loading: boolean;
} {
  const [firstCommitYear, setFirstCommitYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!rootPath) {
      setFirstCommitYear(null);
      setLoading(false);
      return;
    }

    cancelledRef.current = false;
    setLoading(true);

    const fetchYear = async () => {
      if (cache.has(rootPath)) {
        const year = await cache.get(rootPath)!;
        if (!cancelledRef.current) {
          setFirstCommitYear(year);
          setLoading(false);
        }
        return;
      }

      const promise = window.digitalLife.workspace
        .gitVisFirstCommitYear(rootPath)
        .then((result: { ok: boolean; data?: number | null }) =>
          result.ok ? (result.data ?? null) : null,
        );

      if (cache.size >= MAX_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) {
          cache.delete(firstKey);
        }
      }
      cache.set(rootPath, promise);

      const year = await promise;
      if (!cancelledRef.current) {
        setFirstCommitYear(year);
        setLoading(false);
      }
    };

    fetchYear();

    return () => {
      cancelledRef.current = true;
    };
  }, [rootPath]);

  const yearBounds: YearBounds | null = firstCommitYear
    ? { min: firstCommitYear, max: new Date().getFullYear() }
    : null;

  return { yearBounds, loading };
}
