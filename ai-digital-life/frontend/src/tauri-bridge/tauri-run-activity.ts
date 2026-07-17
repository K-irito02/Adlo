import type { RunActivityBridge } from '../shared/ipc/run-activity';
import type { DigitalLifeRunActivityEventV1 } from '@ai-digital-life/kernel';
import { invokeIpc } from './tauri-shared';

export function createTauriRunActivityBridge(): RunActivityBridge {
  return {
    listByRunId: (runId: string, limit?: number) =>
      invokeIpc<DigitalLifeRunActivityEventV1[]>('run_activity_list_by_run_id', { runId, limit }),
  };
}
