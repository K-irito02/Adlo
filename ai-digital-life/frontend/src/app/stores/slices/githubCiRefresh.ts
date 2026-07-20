/**
 * GitHub CI Refresh 共享逻辑
 * Extracted from githubSlice.ts and ciSlice.ts — both had duplicate refreshCiStatus
 * implementations with identical getStatus call + result parsing + error handling.
 */
import type { CiStatusSnapshot } from '@ai-digital-life/kernel';
import { CI_ERROR_CODES } from '@shared/ciErrors';

export interface CiGetStatusParams {
  owner: string;
  repo: string;
  branch: string;
  workflowId?: string | null;
  accessToken?: string | null;
}

export interface CiGetStatusResult {
  ok: boolean;
  data?: CiStatusSnapshot;
  error?: { message?: string };
}

/**
 * Execute a CI status fetch against the provided bridge method.
 *
 * Pure: does not touch the store or any persistence layer. The slice is
 * responsible for reading config/token from state, performing pre-checks
 * (bridge availability, isTauriMode), setting ciLoading/ciError/ciSnapshot,
 * and handling snapshot caching.
 */
export async function executeCiStatusRefresh(
  params: CiGetStatusParams,
  getStatusFn: (p: CiGetStatusParams) => Promise<CiGetStatusResult>,
): Promise<{ ok: true; snapshot: CiStatusSnapshot } | { ok: false; error: string }> {
  if (!params.owner || !params.repo) {
    return { ok: false, error: CI_ERROR_CODES.CONFIG_MISSING_REPO };
  }

  try {
    const result = await getStatusFn(params);
    if (result.ok && result.data) {
      return { ok: true, snapshot: result.data };
    }
    return {
      ok: false,
      error: result.error?.message ?? CI_ERROR_CODES.FETCH_STATUS_FAILED,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}
