import { describe, expect, it } from 'vitest';
import { base64ToArrayBuffer, base64ToBlob } from '../mediaBlob';

describe('mediaBlob', () => {
  it('decodes base64 to Blob with mime', () => {
    const blob = base64ToBlob('AAECAw==', 'video/mp4');
    expect(blob.type).toBe('video/mp4');
    expect(blob.size).toBe(4);
  });

  it('decodes base64 to ArrayBuffer', () => {
    const buffer = base64ToArrayBuffer('AAECAw==');
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([0, 1, 2, 3]));
  });

  it('round-trips empty input', () => {
    expect(base64ToBlob('', 'image/png').size).toBe(0);
  });

  it('tolerates data-URL prefixes and chunked whitespace', () => {
    const buffer = base64ToArrayBuffer('data:video/mp4;base64,AAEC\nAw==');
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([0, 1, 2, 3]));
    expect(base64ToBlob('data:image/png;base64,AAEC Aw==', 'image/png').size).toBe(4);
  });
});
