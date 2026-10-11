import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DocxPreview } from '../DocxPreview';

vi.mock('docx-preview', () => ({
  renderAsync: vi.fn(async (_data: unknown, container: HTMLElement) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'hello docx';
    container.appendChild(paragraph);
  }),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      changesPreviewFailedDocx: 'DOCX preview failed: {error}',
      officeLegacyFormat: 'Legacy format, re-save as {suggest}',
      docxFidelityHint: 'docx fidelity hint',
      docxUnreadable: 'not a valid DOCX',
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

describe('DocxPreview (docx-preview)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders document content into the container', async () => {
    render(<DocxPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('hello docx')).toBeTruthy();
    });
  });

  it('shows the fidelity hint as a floating watermark', async () => {
    render(<DocxPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('docx fidelity hint').className).toContain('adl-fidelity-watermark');
    });
  });

  it('renders without the library gray wrapper (single paper)', async () => {
    const docx = await import('docx-preview');
    render(<DocxPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(docx.renderAsync).toHaveBeenCalled();
    });
    expect(docx.renderAsync).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      expect.objectContaining({ inWrapper: false }),
    );
  });

  it('maps zip unpack failures to a friendly message', async () => {
    const docx = await import('docx-preview');
    vi.mocked(docx.renderAsync).mockRejectedValueOnce(
      new Error("Can't find end of central directory : is this a zip file ?"),
    );
    render(<DocxPreview data={new ArrayBuffer(8)} fileName="docs/report.docx" />);
    await waitFor(() => {
      expect(screen.getByText('not a valid DOCX')).toBeTruthy();
    });
  });

  it('shows a friendly error when rendering fails', async () => {
    const docx = await import('docx-preview');
    vi.mocked(docx.renderAsync).mockRejectedValueOnce(new Error('broken zip'));
    render(<DocxPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText(/DOCX preview failed/u)).toBeTruthy();
    });
  });

  it('shows a re-save hint for legacy .doc without calling the renderer', async () => {
    render(<DocxPreview data={new ArrayBuffer(8)} fileName="docs/old.doc" />);
    await waitFor(() => {
      expect(screen.getByText(/Legacy format, re-save as/u)).toBeTruthy();
    });
    const docx = await import('docx-preview');
    expect(docx.renderAsync).not.toHaveBeenCalled();
  });
});
