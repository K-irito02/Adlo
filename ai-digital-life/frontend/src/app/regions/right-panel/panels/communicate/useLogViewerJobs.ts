import { useEffect, useState } from 'react';
import type { CiJobSummary } from '@ai-digital-life/kernel';
import type { CopyDict } from '@app/i18n';
import type { DigitalLifeBridge } from '@root/shared/ipc/digital-life';

interface CiLogCacheEntry {
  selectedJobId: number | null;
  logs: Record<number, string>;
}

export interface UseLogViewerJobsParams {
  jobs: CiJobSummary[];
  config: { owner: string; repo: string; branch: string };
  dirKey: string;
  initialJobId?: number | null;
  cachedEntry?: CiLogCacheEntry | null;
  updateCiLogCache: (
    dirId: string,
    data: Partial<{ selectedJobId: number | null; logs: Record<number, string> }>,
  ) => void;
  ciAccessToken: string;
  t: CopyDict;
}

export interface UseLogViewerJobsReturn {
  selectedJobId: number | null;
  cachedLogs: Record<number, string>;
  isLoading: boolean;
  error: string | null;
  setSelectedJobId: (id: number | null) => void;
}

/**
 * Owns GitHub-log-viewer job state: the selected job, the per-job log cache,
 * loading/error flags, and the effects that fetch logs and persist the cache.
 */
export function useLogViewerJobs({
  jobs,
  config,
  dirKey,
  initialJobId,
  cachedEntry,
  updateCiLogCache,
  ciAccessToken,
  t,
}: UseLogViewerJobsParams): UseLogViewerJobsReturn {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(
    initialJobId ?? cachedEntry?.selectedJobId ?? null,
  );
  const [cachedLogs, setCachedLogs] = useState<Record<number, string>>(cachedEntry?.logs ?? {});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedJobId === null && jobs.length > 0) {
      setSelectedJobId(jobs[0].jobId);
    }
  }, [jobs, selectedJobId]);

  const bridge = (window as unknown as { digitalLife: DigitalLifeBridge }).digitalLife;

  useEffect(() => {
    if (selectedJobId === null || !config.owner || !config.repo) {
      return;
    }
    const selectedJob = jobs.find((j) => j.jobId === selectedJobId);
    const runId = selectedJob?.runId;
    if (!runId) {
      return;
    }
    if (cachedLogs[selectedJobId]) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    const fetchLogs = async () => {
      try {
        if (bridge?.github?.getJobLogs) {
          const result = await bridge.github.getJobLogs(
            {
              owner: config.owner,
              repo: config.repo,
              branch: config.branch,
              accessToken: ciAccessToken || null,
              workflowId: null,
            },
            runId,
          );
          if (cancelled) {
            return;
          }
          if (result.ok) {
            setCachedLogs((prev) => ({ ...prev, ...result.data }));
          } else {
            setError(result.error?.message ?? t.ciFetchLogFailed);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [
    selectedJobId,
    config.owner,
    config.repo,
    config.branch,
    jobs,
    cachedLogs,
    bridge,
    ciAccessToken,
    t,
  ]);

  useEffect(() => {
    updateCiLogCache(dirKey, { selectedJobId, logs: cachedLogs });
  }, [dirKey, selectedJobId, cachedLogs, updateCiLogCache]);

  return { selectedJobId, cachedLogs, isLoading, error, setSelectedJobId };
}
