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
}

export interface DownloadSettings {
  mode: DownloadMode;
  default_path: string;
}

export interface DownloadProgress {
  id: string;
  bytes_received: number;
  speed: number;
  estimated_end_time: number | null;
}

export interface DownloadErrorPayload {
  id: string;
  url: string;
  reason: string;
  canRetry: boolean;
}

export interface DownloadFinishedPayload {
  id: string;
  url: string;
  filePath: string;
  success: boolean;
}
