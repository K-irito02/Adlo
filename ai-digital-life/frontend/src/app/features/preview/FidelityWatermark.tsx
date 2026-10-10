import { useState } from 'react';

export interface FidelityWatermarkProps {
  /** 保真提示文案（调用端经 i18n 传入） */
  text: string;
  /** 文件标识：切换文件时重播淡出动画 */
  fileKey?: string;
}

/**
 * 保真提示水印：右上角纯加粗文字，无边框装饰，不拦截交互；
 * 呈现 5 秒后淡出并移出 DOM（动效敏感用户保持常显）。
 * 非滚动容器（pptx）用 absolute 固定；滚动容器（docx/xlsx）见 CSS sticky 变体。
 */
export function FidelityWatermark({ text, fileKey }: FidelityWatermarkProps) {
  const [gone, setGone] = useState(false);
  if (gone) {
    return null;
  }
  return (
    <p
      key={fileKey}
      className="adl-fidelity-watermark"
      role="note"
      onAnimationEnd={() => setGone(true)}
    >
      {text}
    </p>
  );
}
