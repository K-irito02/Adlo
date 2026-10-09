interface ClipboardKindLabels {
  clipboardText: string;
  clipboardImage: string;
  clipboardHtml: string;
  clipboardRtf: string;
}

/**
 * 剪贴板条目类型的展示名：已知类型走 i18n，未知类型原样回退为 kind（后端新增类型时不会显示空白）。
 */
export function getClipboardKindLabel(kind: string, t: ClipboardKindLabels): string {
  if (kind === 'image') {
    return t.clipboardImage;
  }
  if (kind === 'text') {
    return t.clipboardText;
  }
  if (kind === 'html') {
    return t.clipboardHtml;
  }
  if (kind === 'rtf') {
    return t.clipboardRtf;
  }
  return kind;
}
