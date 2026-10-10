import { useEffect, useMemo, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { base64ToBlob } from './mediaBlob';
import type { WorkspaceMediaDocument } from '@shared/ipc/workspace';

export type MediaKind = 'image' | 'audio' | 'video';

export interface MediaPreviewProps {
  media: WorkspaceMediaDocument;
  kind: MediaKind;
}

/**
 * 图片/音频/视频原生预览。
 * 播放/暂停/进度条/音量/全屏全部走原生 controls，不做自研控件。
 */
export function MediaPreview({ media, kind }: MediaPreviewProps) {
  const { t, formatT } = useTCopy();
  const [error, setError] = useState<string | null>(null);

  const objectUrl = useMemo(() => {
    try {
      return URL.createObjectURL(base64ToBlob(media.base64, media.mime));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [media.base64, media.mime]);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  if (error || !objectUrl) {
    return (
      <div className="adl-media-preview adl-media-preview--error" role="alert">
        <p>{formatT(t, 'mediaPreviewFailed', { error: error ?? '' })}</p>
      </div>
    );
  }

  if (kind === 'image') {
    return (
      <div className="adl-media-preview adl-media-preview--image">
        <img src={objectUrl} alt={media.path} draggable={false} />
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div className="adl-media-preview adl-media-preview--audio">
        <audio controls preload="metadata" src={objectUrl} />
      </div>
    );
  }

  return (
    <div className="adl-media-preview adl-media-preview--video">
      <video controls preload="metadata" playsInline src={objectUrl} />
    </div>
  );
}
