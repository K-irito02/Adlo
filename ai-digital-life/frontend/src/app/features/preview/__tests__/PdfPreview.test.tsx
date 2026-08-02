import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PdfPreview } from '../PdfPreview';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      changesPreviewFailedPdf: 'PDF preview failed: {error}',
      changesPdfPrevPage: 'Previous page',
      changesPdfNextPage: 'Next page',
    },
    locale: 'en-US',
    formatT: (dict: Record<string, string>, key: string, params?: Record<string, unknown>) => {
      let out = dict[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          out = out.replace(`{${k}}`, String(v));
        }
      }
      return out;
    },
  }),
}));

vi.mock('pdfjs-dist', () => {
  const render = vi.fn().mockReturnValue({ promise: Promise.resolve() });
  const getPage = vi.fn().mockResolvedValue({
    getViewport: () => ({ width: 100, height: 200 }),
    render,
  });
  const getDocument = vi.fn().mockReturnValue({
    promise: Promise.resolve({ numPages: 3, getPage }),
  });
  return {
    GlobalWorkerOptions: {},
    getDocument,
  };
});

describe('PdfPreview navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders prev/next page buttons with accessible chevron icons', async () => {
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });

    const prevBtn = screen.getByRole('button', { name: 'Previous page' });
    const nextBtn = screen.getByRole('button', { name: 'Next page' });
    expect(prevBtn.querySelector('svg')).toBeTruthy();
    expect(nextBtn.querySelector('svg')).toBeTruthy();
    expect(prevBtn.querySelector('path')?.getAttribute('d')).toBe('M14 7L9 12L14 17');
    expect(nextBtn.querySelector('path')?.getAttribute('d')).toBe('M10 17L15 12L10 7');
  });
});
