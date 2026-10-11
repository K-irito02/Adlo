/**
 * base64 → Blob 工具（媒体/办公预览共用）。
 * 分片解码避免超大字符串一次性拼接导致的内存峰值。
 */
export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const chunkSize = 8192;
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
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
