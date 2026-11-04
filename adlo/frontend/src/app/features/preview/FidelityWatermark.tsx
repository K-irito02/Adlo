import { useEffect, useState } from 'react';

export interface FidelityWatermarkProps {
  /** 保真提示文案（调用端经 i18n 传入） */
  text: string;
  /** 文件标识：切换文件时重播淡出动画 */
  fileKey?: string;
}

/**
 * 保真提示水印：右上角纯加粗文字，无边框装饰，不拦截交互；
 * 呈现 5 秒后淡出并移出 DOM（动效敏感用户保持常显）。
 * 定位：三类预览（docx/xlsx/pptx）均为"外层 relative 不滚动 + 内层滚动"结构，
 * 水印绝对定位锚定外层，滚动不影响位置（原 sticky 变体已删除，见 CSS）。
 * 注意：调用处须把 `key={fileKey}` 写在组件上（而非内部 `<p>`），
 * 否则同挂载换文件不会重置 `gone`、水印永不重现（Phase 4 审查 R-05）。
 */
export function FidelityWatermark({ text, fileKey }: FidelityWatermarkProps) {
  const [gone, setGone] = useState(false);
  // 同挂载换文件（fileKey 变化）时重现水印；整树 remount 时自然重置。
  useEffect(() => {
    setGone(false);
  }, [fileKey]);
  // 兜底移除（L-04）：CSS 缺失/类名漂移导致动画不跑时，水印不永久驻留；
  // 动效敏感分支同样超时移除（信息已可访问，超时与淡出等效）。
  useEffect(() => {
    const timer = window.setTimeout(() => setGone(true), 6000);
    return () => window.clearTimeout(timer);
  }, [fileKey]);
  if (gone) {
    return null;
  }
  return (
    <p className="adl-fidelity-watermark" role="note" onAnimationEnd={() => setGone(true)}>
      {text}
    </p>
  );
}
