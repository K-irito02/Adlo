import type * as PdfjsModule from 'pdfjs-dist';

export async function loadPdfWorker(): Promise<typeof PdfjsModule> {
  return import('pdfjs-dist');
}
