import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PptxPreview } from '../PptxPreview';

const previewFn = vi.fn(async () => undefined);
vi.mock('pptx-preview', () => ({
  init: vi.fn(() => ({ preview: previewFn })),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      changesPreviewFailedPresentation: 'Presentation preview failed: {error}',
      presentationFidelityHint: 'fidelity hint',
      officeLegacyFormat: 'Legacy format, re-save as {suggest}',
    },
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

describe('PptxPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the fidelity hint as a floating watermark', async () => {
    render(<PptxPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(previewFn).toHaveBeenCalled();
    });
    const hint = screen.getByText('fidelity hint');
    expect(hint.className).toContain('adl-fidelity-watermark');
  });

  it('shows a re-save hint for legacy .ppt without initializing the viewer', async () => {
    render(<PptxPreview data={new ArrayBuffer(8)} fileName="docs/old.ppt" />);
    await waitFor(() => {
      expect(screen.getByText(/Legacy format, re-save as/u)).toBeTruthy();
    });
    const pptx = await import('pptx-preview');
    expect(pptx.init).not.toHaveBeenCalled();
  });
});
