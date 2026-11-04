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
    // base64 → Blob 是同步完成，本分支在 effect 首轮就会离开；在此渲染扫光只会
    // 在延迟窗口内空转（组件已卸载），因此保持空白，反馈由读取阶段的 surface
    // 占位承担；真正耗时的 `<img>` 解码由浏览器在挂载后处理。
    return null;
  }

  // 空文件是中性信息态（收尾 F-20），错误才是警报态：role 区分，避免打断读屏用户。
  if (error !== null || !objectUrl) {
    if (error) {
      return (
        <div className="adl-media-preview adl-media-preview--error" role="alert">
          <p>{formatT(t, 'mediaPreviewFailed', { error })}</p>
        </div>
      );
    }
    return (
      <div className="adl-media-preview adl-media-preview--error" role="status">
        <p>{t.changesPreviewBinary as string}</p>
        <p>{t.mediaEmptyFile as string}</p>
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
