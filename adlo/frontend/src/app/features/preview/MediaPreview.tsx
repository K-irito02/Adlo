import { useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { MediaZoomViewport } from './MediaZoomViewport';
import { UnsupportedPreviewCard } from './UnsupportedPreviewCard';
import { useMediaSession } from './useMediaSession';
import type { WorkspaceMediaSource } from '@shared/ipc/workspace';

export type MediaKind = 'image' | 'audio' | 'video';

export interface MediaPreviewProps {
  media: WorkspaceMediaSource;
  kind: MediaKind;
  /** 工作区 id：解码失败/格式不支持时解析绝对路径，交给系统默认程序打开。 */
  workspaceId?: string;
}

/**
 * 图片/音频/视频原生预览。
 * 播放/暂停/进度条/音量/全屏全部走原生 controls，不做自研控件。
 *
 * 媒体来源（事项 7）：`media.url` 指向工作区 Range 流式端点，直接作 `src`：
 * - 不再整文件 base64 进内存 → 任意体积都能打开、可拖动进度；
 * - 不产生 `blob:` URL（打包态 CSP 曾因缺 `blob:` 把整类预览判成「无法解码」）。
 *
 * 状态口径（事项 12/14）：
 * - 0 字节 → 中性「文件为空」，不给系统播放器（空文件用播放器也打不开）；
 * - 解码失败 → 「内置播放器不支持此格式」+「用系统播放器打开」（浏览器与内部同一
 *   Chromium 解码器，换标签解不了；系统播放器才是真正能播放 MKV/AVI 的地方）；
 * - 图片/视频支持 Ctrl+滚轮与胶囊按钮缩放（100% = 适配可视区）。
 *
 * 安全约束：SVG 一律经 `<img>` 渲染（脚本不执行），禁止换 `<object>`/`<iframe>`/内联
 *（后端 MIME 只做扩展名推断、不做安全判定，见 guess_media_mime）。
 */
export function MediaPreview({ media, kind, workspaceId }: MediaPreviewProps) {
  const { t } = useTCopy();
  // 解码/播放失败（损坏文件、浏览器不支持的编码）：URL 有效但元素 onError。
  const [renderFailed, setRenderFailed] = useState(false);
  // 系统媒体卡片的副标题（应用名）：hooks 必须在任何 early return 之前调用。
  const appName = useAppStore((state) => state.appInfo?.appName) ?? 'Adlo';

  // 换文件即复位：失败态不能跨文件残留（旧文件坏掉不该让新文件显示错误）。
  useEffect(() => {
    setRenderFailed(false);
  }, [media.url]);

  if (!media.url) {
    // 旧版 OLE 办公（.doc/.dot/.ppt）占位：无 URL、无错误，由办公分支给转存指引。
    return null;
  }

  if (media.size === 0) {
    return (
      <div className="adl-media-preview adl-media-preview--empty" role="status">
        <p className="adl-media-preview__empty-title">{t.mediaEmptyFileTitle as string}</p>
        <p>{t.mediaEmptyFile as string}</p>
      </div>
    );
  }

  if (renderFailed) {
    return (
      <div className="adl-media-preview adl-media-preview--empty" role="alert">
        <UnsupportedPreviewCard
          title={t.mediaUnsupportedFormat as string}
          detail={t.mediaPreviewDecodeFailed as string}
          filePath={media.path}
          workspaceId={workspaceId}
        />
      </div>
    );
  }

  const handleRenderError = () => setRenderFailed(true);
  // 系统媒体卡片标题：文件名去掉扩展名（与浏览器里站点自报的歌名同层信息）。
  const baseName = media.path.split(/[\\/]/).pop() ?? media.path;
  const dotIndex = baseName.lastIndexOf('.');
  const mediaTitle = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;

  if (kind === 'image' || kind === 'video') {
    return (
      <div className={`adl-media-preview adl-media-preview--${kind}`}>
        <MediaZoomViewport
          kind={kind}
          src={media.url}
          alt={media.path}
          mediaTitle={mediaTitle}
          mediaArtist={appName}
          onRenderError={handleRenderError}
        />
      </div>
    );
  }

  return (
    <div className="adl-media-preview adl-media-preview--audio">
      <AudioMedia src={media.url} title={mediaTitle} artist={appName} onError={handleRenderError} />
    </div>
  );
}

/** 音频元素 + 系统媒体卡片接线（元素自带 ref，hook 只能在这里挂）。 */
function AudioMedia({
  src,
  title,
  artist,
  onError,
}: {
  src: string;
  title: string;
  artist: string;
  onError: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useMediaSession(audioRef, { title, artist }, true);
  return <audio ref={audioRef} controls preload="metadata" src={src} onError={onError} />;
}
