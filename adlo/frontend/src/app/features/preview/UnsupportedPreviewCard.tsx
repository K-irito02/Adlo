import { useTCopy } from '@i18n/useTCopy';
import { useOpenWithSystemApp } from './useOpenWithSystemApp';

export interface UnsupportedPreviewCardProps {
  /** 主文案（"无法预览此格式" / "文件为空" …） */
  title: string;
  /** 补充说明（可为空） */
  hint?: string;
  /** 悬停详情（`title` 属性；不进入可见文案，例如媒体解码失败的技术原因） */
  detail?: string;
  /**
   * 文件工作区相对路径：给出时在卡片底部渲染「用系统默认程序打开」。
   * 不传（如"文件为空"）则不提供该系统入口。
   */
  filePath?: string;
  workspaceId?: string;
  /** 警报态（默认 false：中性信息态，不打断读屏） */
  alert?: boolean;
}

const defaultIcon = (
  <svg
    className="adl-unsupported-preview__icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </svg>
);

/**
 * 统一的「无法在应用内预览」卡片（事项 12 收口）。
 *
 * 覆盖四类失败：格式不支持（odt/zip/…）、Office 解析失败（odp、损坏文档）、
 * 旧版 Office 格式指引、媒体解码失败。给出 `filePath` 的类型都会带上
 * 「用系统默认程序打开」这条真正可行的出路，而不是留一张空白或一句没有下一步的错误；
 * 无路径的场景（0 字节、Office 临时锁文件）只给说明。
 */
export function UnsupportedPreviewCard({
  title,
  hint,
  detail,
  filePath,
  workspaceId,
  alert = false,
}: UnsupportedPreviewCardProps) {
  const { t } = useTCopy();
  const openWithSystemApp = useOpenWithSystemApp(workspaceId);
  return (
    <div className="adl-unsupported-preview" role={alert ? 'alert' : 'status'} title={detail}>
      {defaultIcon}
      <span className="adl-unsupported-preview__text">{title}</span>
      {hint ? <span className="adl-unsupported-preview__hint">{hint}</span> : null}
      {filePath ? (
        <div className="adl-preview-external">
          <button
            type="button"
            className="adl-unsupported-preview__action"
            title={t.mediaOpenWithSystemHint as string}
            aria-label={t.mediaOpenWithSystemHint as string}
            onClick={() => openWithSystemApp(filePath)}
          >
            {t.mediaOpenWithSystem as string}
          </button>
        </div>
      ) : null}
    </div>
  );
}
