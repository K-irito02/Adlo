import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { XlsxPreview } from '../XlsxPreview';

vi.mock('xlsx', () => ({
  read: vi.fn(() => ({
    SheetNames: ['Sheet1', 'Sheet2'],
    Sheets: { Sheet1: {}, Sheet2: {} },
  })),
  utils: { sheet_to_html: vi.fn(() => '<table><tr><td>A1</td></tr></table>') },
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      changesPreviewFailedSpreadsheet: 'Spreadsheet preview failed: {error}',
      spreadsheetSheet: 'Sheet',
      spreadsheetFidelityHint: 'xlsx fidelity hint',
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

describe('XlsxPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all sheets with a switcher', async () => {
    render(<XlsxPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('A1')).toBeTruthy();
    });
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('shows the fidelity hint as a floating watermark', async () => {
    render(<XlsxPreview data={new ArrayBuffer(8)} fileName="docs/report.xlsx" />);
    await waitFor(() => {
      expect(screen.getByText('xlsx fidelity hint').className).toContain('adl-fidelity-watermark');
    });
  });
});
