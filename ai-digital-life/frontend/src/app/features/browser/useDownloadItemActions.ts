import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { DownloadRecord } from '@shared/ipc/download';

export function useDownloadItemActions() {
  const deleteDownloadFile = useAppStore((s) => s.deleteDownloadFile);
  const removeDownloadRecord = useAppStore((s) => s.removeDownloadRecord);

  const handleOpenFile = useCallback(async (rec: DownloadRecord) => {
    if (!rec.file_path) {
      return;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('download_open_file', { filePath: rec.file_path });
    } catch {
      // fallback: ignore
    }
  }, []);

  const handleShowInFolder = useCallback(async (rec: DownloadRecord) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('download_show_in_folder', { filePath: rec.file_path });
    } catch {
      // fallback: ignore
    }
  }, []);

  const handleDeleteFile = useCallback(
    async (rec: DownloadRecord) => {
      await deleteDownloadFile(rec.id);
    },
    [deleteDownloadFile],
  );

  const handleRemoveRecord = useCallback(
    async (rec: DownloadRecord) => {
      await removeDownloadRecord(rec.id);
    },
    [removeDownloadRecord],
  );

  const handleCopyLink = useCallback(async (rec: DownloadRecord) => {
    try {
      await navigator.clipboard.writeText(rec.url);
    } catch {
      // fallback: ignore
    }
  }, []);

  return {
    handleOpenFile,
    handleShowInFolder,
    handleDeleteFile,
    handleRemoveRecord,
    handleCopyLink,
  };
}
