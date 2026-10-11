import { useEffect, useState } from 'react';
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
 * 安全约束：SVG 等一律经 `<img>` 渲染（脚本不执行），禁止换 `<object>`/`<iframe>`/内联
 *（后端 MIME 只做扩展名推断、不做安全判定，见 guess_media_mime）。
 *
 * 状态机（Phase 4 审查 R-01）：object URL 的创建/失败经 effect 持有，
 * 成功必清 error——失败后换合法文件不再卡死；空 base64 直接进错误分支。
 */
export function MediaPreview({ media, kind }: MediaPreviewProps) {
  const { t, formatT } = useTCopy();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 首帧判定（rev2 复审 N-01）：effect 落定前既非错误也非空——渲染 null，
  // 否则合法文件首帧会闪一下"文件为空"错误态。
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let revoked = false;
    let url: string | null = null;
    setSettled(false);
    if (!media.base64) {
      setError('');
      setObjectUrl(null);
      setSettled(true);
      return undefined;
    }
    try {
      url = URL.createObjectURL(base64ToBlob(media.base64, media.mime));
      if (!revoked) {
        setObjectUrl(url);
        setError(null);
        setSettled(true);
      } else {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (!revoked) {
        setError(err instanceof Error ? err.message : String(err));
        setObjectUrl(null);
        setSettled(true);
      }
    }
    return () => {
      revoked = true;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [media.base64, media.mime]);

  if (!settled) {
    return null;
  }

  if (error !== null || !objectUrl) {
    return (
      <div className="adl-media-preview adl-media-preview--error" role="alert">
        {error ? (
          <p>{formatT(t, 'mediaPreviewFailed', { error })}</p>
        ) : (
          <>
            <p>{t.changesPreviewBinary as string}</p>
            <p>{t.mediaEmptyFile as string}</p>
          </>
        )}
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
