export type DownloadStatus = 'in_progress' | 'completed' | 'failed' | 'paused' | 'canceled';

export type DownloadMode = 'auto' | 'ask';

export interface DownloadRecord {
  id: string;
  url: string;
  file_name: string;
  file_path: string;
  total_bytes: number | null;
  bytes_received: number;
  mime_type: string | null;
  status: DownloadStatus;
  interrupt_reason: string | null;
  created_at: number;
  completed_at: number | null;
  source_tab_id: string | null;
  /** Whether the server supports range requests for resumption. `null` = unknown. */
  resumable?: boolean | null;
}

export interface DownloadFileState {
  id: string;
  exists: boolean;
  in_default_dir: boolean;
  error: string | null;
}

export interface DownloadFileStatesInput {
  ids: string[];
}

export interface DownloadRedownloadInput {
  id: string;
  tabId: string;
}

export interface DownloadPrepareRedownloadInput {
  id: string;
}

export interface DownloadSettings {
  mode: DownloadMode;
  default_path: string;
  /** 更改默认下载路径时自动迁移旧路径全部文件（成功后删除旧目录）。 */
  auto_migrate_on_path_change: boolean;
}

/** Outcome of a tracked-only default-path migration: only completed downloads
 * whose file exists under the old default dir are moved; untracked files stay. */
export interface DownloadMigrationResult {
  migrated: number;
  missing: number;
  failed: number;
}

/** Result of a user-initiated pause. The backend reflects the true end state:
 * `paused` if the transfer was actually paused, or `completed` if the transfer
 * had already finished when pause was requested (matches Chrome/Edge). */
export interface DownloadPauseResult {
  status: DownloadStatus;
}

export interface DownloadProgress {
  id: string;
  bytes_received: number;
  speed: number;
  estimated_end_time: number | null;
}

export interface DownloadProgressPayload {
  id: string;
  bytes_received: number;
  total_bytes: number | null;
  speed: number;
}

export interface DownloadErrorPayload {
  id: string;
  url: string;
  /** Present for failures that have no download record (blob save rejects). */
  fileName?: string;
  reason: string;
  canRetry: boolean;
  source_tab_id?: string;
}

export interface DownloadFinishedPayload {
  id: string;
  url: string;
  filePath: string;
  success: boolean;
  source_tab_id?: string;
}

export interface DownloadIdPayload {
  id: string;
  source_tab_id?: string;
  /** The backend pause kind (UserPaused / NonResumablePaused / CosmeticPaused). */
  interrupt_reason?: string | null;
}
