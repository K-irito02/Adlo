import { useTCopy } from '@i18n/useTCopy';
import type { CopyKey } from '@i18n/types';

export interface HeavyPreviewGateProps {
  /** 文件工作区相对路径（展示用） */
  name: string;
  /** 人类可读体积（调用端按字节/字符各自精确计算后传入） */
  sizeText: string;
  /** 确认回调：调用端记忆确认态并重渲染 */
  onConfirm: () => void;
  /**
   * 提示文案 key（方案A）：差异门用 `heavyPreviewHintDiff` 说明简化渲染，
   * 缺省沿用通用 `heavyPreviewHint`（文件面板等全量渲染路径）。
   */
  hintKey?: Extract<CopyKey, 'heavyPreviewHint' | 'heavyPreviewHintDiff'>;
  /**
   * 标题 key：行数触发的重型与“文件体积大”不是同一原因，
   * 差异门传 `heavyPreviewTitleDiff` 使用中性措辞。
   */
  titleKey?: Extract<CopyKey, 'heavyPreviewTitle' | 'heavyPreviewTitleDiff'>;
}

/**
 * 大文件确认门（收尾 M1 抽取，EditorSurfaceShell/FilePreviewRenderers 共用）：
 * 居中图标 + 标题 + 体积说明 + “仍然打开”按钮，统一样式与无障碍语义。
 */
export function HeavyPreviewGate({
  name,
  sizeText,
  onConfirm,
  hintKey,
  titleKey,
}: HeavyPreviewGateProps) {
  const { t, formatT } = useTCopy();
  return (
    <div className="adl-unsupported-preview" role="status">
      <svg
        className="adl-unsupported-preview__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
        <path d="M12 11v6" />
        <path d="M9 14h6" />
      </svg>
      <span className="adl-unsupported-preview__text">
        {t[titleKey ?? 'heavyPreviewTitle'] as string}
      </span>
      <span className="adl-unsupported-preview__hint">
        {formatT(t, hintKey ?? 'heavyPreviewHint', { name, size: sizeText })}
      </span>
      <button type="button" className="adl-unsupported-preview__action" onClick={onConfirm}>
        {t.heavyPreviewOpen as string}
      </button>
    </div>
  );
}
