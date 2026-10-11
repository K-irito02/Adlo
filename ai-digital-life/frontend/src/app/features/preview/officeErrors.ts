/**
 * 办公文档 zip 解包失败嗅探（Phase 4 审查 R-07，docx/xlsx/pptx 共用）：
 * JSZip/SheetJS 等抛出的英文技术细节（central directory / is this a zip …）
 * 直接展示会吓到用户，调用端映射为各品类中文友好提示。
 * 正则有意收紧（`not a zip` 全词）：宽泛的 `not .*zip` 易误伤无关文案。
 */
export function isZipUnpackError(message: string): boolean {
  return /central directory|is this a zip|not a zip|invalid.*zip|bad zip/i.test(message);
}
