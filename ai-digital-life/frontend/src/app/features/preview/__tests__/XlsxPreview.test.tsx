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
      spreadsheetUnreadable: 'not a valid spreadsheet',
      spreadsheetEmpty: 'workbook is empty',
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

  it('maps zip unpack failures to a friendly message', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockImplementationOnce(() => {
      throw new Error('invalid zip file');
    });
    render(<XlsxPreview data={new ArrayBuffer(8)} fileName="docs/broken.xlsx" />);
    await waitFor(() => {
      expect(screen.getByText('not a valid spreadsheet')).toBeTruthy();
    });
  });

  it('shows an empty notice for workbooks without sheets', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockImplementationOnce(() => ({ SheetNames: [], Sheets: {} }) as never);
    render(<XlsxPreview data={new ArrayBuffer(8)} fileName="docs/empty.xlsx" />);
    await waitFor(() => {
      expect(screen.getByText('workbook is empty')).toBeTruthy();
    });
  });

  it('does not rewrite table DOM on theme-only rerenders (scroll anchoring regression)', async () => {
    const data = new ArrayBuffer(8);
    const { container, rerender } = render(<XlsxPreview data={data} theme="dark" />);
    await waitFor(() => {
      expect(screen.getByText('A1')).toBeTruthy();
    });
    const table = container.querySelector('.adl-xlsx-preview__table');
    const firstChildBefore = table?.firstChild;
    expect(firstChildBefore).not.toBeNull();
    // 同一份 data（引用不变）：不触发重载，仅 theme 变化
    rerender(<XlsxPreview data={data} theme="light" />);
    await waitFor(() => {
      expect(container.querySelector('.adl-xlsx-preview--light')).not.toBeNull();
    });
    // 同内容下包装对象恒等 → React 跳过 innerHTML 写入，子节点引用不变
    expect(container.querySelector('.adl-xlsx-preview__table')?.firstChild).toBe(firstChildBefore);
  });

  it('reuses cached sheet HTML for the same cacheKey (no re-read)', async () => {
    const XLSX = await import('xlsx');
    const first = render(<XlsxPreview data={new ArrayBuffer(8)} cacheKey="xlsx-cache-test" />);
    await waitFor(() => {
      expect(screen.getByText('A1')).toBeTruthy();
    });
    first.unmount();
    vi.mocked(XLSX.read).mockClear();

    const second = render(<XlsxPreview data={new ArrayBuffer(16)} cacheKey="xlsx-cache-test" />);
    await waitFor(() => {
      expect(second.container.textContent).toContain('A1');
    });
    expect(XLSX.read).not.toHaveBeenCalled();
  });
});
