/**
 * base64 → Blob 工具（媒体/办公预览共用）。
 * 优先 `Uint8Array.fromBase64`（Baseline 2025+，零逐字符循环），
 * 不可用时回退分片循环（64KB 切片）。
 * 输入宽容 data-URL 前缀与空白分块（收尾 L-03），后端恒返纯 base64，此为防御。
 */
function cleanBase64Input(base64: string): string {
  return base64.replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const cleaned = cleanBase64Input(base64);
  const fromBase64 = (
    Uint8Array as unknown as {
      fromBase64?: (input: string) => Uint8Array;
    }
  ).fromBase64;
  if (typeof fromBase64 === 'function') {
    return new Blob([fromBase64.call(Uint8Array, cleaned)], {
      type: mime || 'application/octet-stream',
    });
  }
  const binary = atob(cleaned);
  const chunkSize = 65536;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < binary.length; i += chunkSize) {
    const slice = binary.slice(i, i + chunkSize);
    const bytes = new Uint8Array(slice.length);
    for (let j = 0; j < slice.length; j += 1) {
      bytes[j] = slice.charCodeAt(j);
    }
    chunks.push(bytes);
  }
  return new Blob(chunks, { type: mime || 'application/octet-stream' });
}

/** base64 → ArrayBuffer（办公文档预览库吃 ArrayBuffer 时用）。 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const cleaned = cleanBase64Input(base64);
  const fromBase64 = (
    Uint8Array as unknown as {
      fromBase64?: (input: string) => Uint8Array;
    }
  ).fromBase64;
  if (typeof fromBase64 === 'function') {
    return fromBase64.call(Uint8Array, cleaned).buffer as ArrayBuffer;
  }
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
