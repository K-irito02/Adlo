import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { BrowserDownloadPathSection } from '../BrowserDownloadPathSection';

const mocks = vi.hoisted(() => ({
  downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
  systemDefaultDownloadPath: '',
  changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
  updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
  fetchSystemDefaultDownloadPath: vi.fn(async () => undefined),
  showToast: vi.fn(),
  isLoadingSettings: false,
}));

vi.mock('@stores/slicedStore', () => ({
  useAppStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        downloadSettings: mocks.downloadSettings,
        systemDefaultDownloadPath: mocks.systemDefaultDownloadPath,
        isLoadingSettings: mocks.isLoadingSettings,
        changeDownloadPath: mocks.changeDownloadPath,
        updateDownloadSettings: mocks.updateDownloadSettings,
        fetchSystemDefaultDownloadPath: mocks.fetchSystemDefaultDownloadPath,
        showToast: mocks.showToast,
      }),
    {
      getState: () => ({
        changeDownloadPath: mocks.changeDownloadPath,
        updateDownloadSettings: mocks.updateDownloadSettings,
        fetchSystemDefaultDownloadPath: mocks.fetchSystemDefaultDownloadPath,
        showToast: mocks.showToast,
        downloadSettings: mocks.downloadSettings,
        systemDefaultDownloadPath: mocks.systemDefaultDownloadPath,
      }),
    },
  ),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      browserDownloadSettingsPath: '默认下载路径',
      browserDownloadSettingsPathDesc: '下载文件保存的目录',
      storageManualInputPlaceholder: '输入绝对路径…',
      storagePickDir: '选择目录',
      storagePickUnavailable: '当前环境不支持目录选择',
      storagePickFailed: '选择目录失败：{error}',
      storageUnknownError: '未知错误',
      storageDownloadMigrateLabel: '更改路径时自动迁移文件',
      storageDownloadMigrateHint: '迁移说明',
      storageDownloadMigrateEnableTitle: '开启自动迁移？',
      storageDownloadMigrateEnableConfirm: '开启确认文案',
      storageDownloadMigrateEnableConfirmBtn: '确认开启',
      storageDownloadMigrateFailed: '迁移文件失败：{error}',
      storageCancel: '取消',
      settingsUpdateFailed: '设置更新失败',
    } as unknown as CopyDict,
  }),
}));

function renderSection() {
  return render(
    <TCopyProvider t={{} as unknown as CopyDict} locale="en-US">
      <BrowserDownloadPathSection />
    </TCopyProvider>,
  );
}

beforeEach(() => {
  mocks.downloadSettings = {
    mode: 'ask',
    default_path: '',
    auto_migrate_on_path_change: false,
  };
  mocks.systemDefaultDownloadPath = '';
  mocks.isLoadingSettings = false;
  mocks.changeDownloadPath.mockClear();
  mocks.updateDownloadSettings.mockClear();
  mocks.fetchSystemDefaultDownloadPath.mockClear();
  mocks.showToast.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BrowserDownloadPathSection', () => {
  it('renders path row and migrate checkbox (default off)', () => {
    renderSection();
    expect(screen.getByTestId('download-path-row')).toBeTruthy();
    expect(screen.getByTestId('download-path-pick')).toBeTruthy();
    const checkbox = screen.getByTestId('download-migrate-checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('committing a new path calls changeDownloadPath with current migrate flag', async () => {
    renderSection();
    const input = screen.getByLabelText('默认下载路径') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'D:/downloads' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(mocks.changeDownloadPath).toHaveBeenCalledWith('D:/downloads', false);
    });
  });

  it('normalizes a windows-style alias of the system default to implicit default', async () => {
    mocks.downloadSettings.default_path = 'D:/other';
    mocks.systemDefaultDownloadPath = 'C:/Users/u/Downloads';
    renderSection();
    const input = screen.getByLabelText('默认下载路径') as HTMLInputElement;
    // 反斜杠 + 大小写差异的 Windows 别名 → 归一为 ''（不落盘显式值）。
    fireEvent.change(input, { target: { value: 'c:\\users\\u\\downloads\\' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(mocks.changeDownloadPath).toHaveBeenCalledWith('', false);
    });
  });

  it('normalizes forward-slash windows case variants via drive-letter sniffing', async () => {
    mocks.downloadSettings.default_path = 'D:/other';
    mocks.systemDefaultDownloadPath = 'C:/Users/u/Downloads';
    renderSection();
    const input = screen.getByLabelText('默认下载路径') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'c:/users/u/downloads' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(mocks.changeDownloadPath).toHaveBeenCalledWith('', false);
    });
  });

  it('treats forward-slash UNC as windows-style for case folding (R4-N1)', async () => {
    mocks.downloadSettings.default_path = 'D:/other';
    mocks.systemDefaultDownloadPath = '//Srv/Share';
    renderSection();
    const input = screen.getByLabelText('默认下载路径') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '//srv/share' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(mocks.changeDownloadPath).toHaveBeenCalledWith('', false);
    });
  });

  it('does not lowercase unix-style paths when comparing (case-sensitive)', async () => {
    mocks.downloadSettings.default_path = 'D:/other';
    mocks.systemDefaultDownloadPath = '/home/u/downloads';
    renderSection();
    const input = screen.getByLabelText('默认下载路径') as HTMLInputElement;
    // Unix 风格（仅 `/`）大小写不同 → 不同目录，原样提交（M1：后端仅 Windows 小写）。
    fireEvent.change(input, { target: { value: '/Home/U/Downloads' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(mocks.changeDownloadPath).toHaveBeenCalledWith('/Home/U/Downloads', false);
    });
  });

  it('enabling migrate opens a confirm dialog and only writes after confirm', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('download-migrate-checkbox'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(mocks.updateDownloadSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认开启' }));
    await waitFor(() => {
      expect(mocks.updateDownloadSettings).toHaveBeenCalledWith(undefined, undefined, true);
    });
  });

  it('disabling migrate writes immediately without a dialog', async () => {
    mocks.downloadSettings.auto_migrate_on_path_change = true;
    renderSection();
    fireEvent.click(screen.getByTestId('download-migrate-checkbox'));
    await waitFor(() => {
      expect(mocks.updateDownloadSettings).toHaveBeenCalledWith(undefined, undefined, false);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the migrate row above the path row without a divider between them', () => {
    renderSection();
    const migrateRow = screen.getByTestId('download-migrate-row');
    const pathRow = screen.getByTestId('download-path-row');
    expect(
      migrateRow.compareDocumentPosition(pathRow) & Node.DOCUMENT_POSITION_FOLLOWING,
      'migrate row should come first',
    ).toBeTruthy();
    expect(migrateRow.classList.contains('adl-settings-row--no-divider')).toBe(true);
    expect(migrateRow.classList.contains('adl-settings-row--path-center')).toBe(true);
    expect(pathRow.classList.contains('adl-settings-row--path-center')).toBe(true);
  });

  it('shows the resolved system default instead of an empty input when stored path is empty', () => {
    mocks.systemDefaultDownloadPath = 'C:/Users/u/Downloads';
    renderSection();
    expect(mocks.fetchSystemDefaultDownloadPath).toHaveBeenCalled();
    expect((screen.getByLabelText('默认下载路径') as HTMLInputElement).value).toBe(
      'C:/Users/u/Downloads',
    );
  });

  it('blurring the unchanged resolved display does not write back (keeps implicit default)', async () => {
    mocks.systemDefaultDownloadPath = 'C:/Users/u/Downloads';
    renderSection();
    const input = screen.getByLabelText('默认下载路径') as HTMLInputElement;
    fireEvent.blur(input);
    await waitFor(() => {
      expect(mocks.fetchSystemDefaultDownloadPath).toHaveBeenCalled();
    });
    expect(mocks.changeDownloadPath).not.toHaveBeenCalled();
  });

  it('follows an async system-default refill without overwriting in-flight typing', () => {
    mocks.systemDefaultDownloadPath = '';
    const { rerender } = renderSection();
    const input = screen.getByLabelText('默认下载路径') as HTMLInputElement;
    expect(input.value).toBe('');
    // 异步解析值到达：未编辑过 → 草稿跟随外部值（F13 异步回填路径）。
    mocks.systemDefaultDownloadPath = 'C:/Users/u/Downloads';
    rerender(
      <TCopyProvider t={{} as unknown as CopyDict} locale="en-US">
        <BrowserDownloadPathSection />
      </TCopyProvider>,
    );
    expect((screen.getByLabelText('默认下载路径') as HTMLInputElement).value).toBe(
      'C:/Users/u/Downloads',
    );
    // 用户在途输入期间外部再次更新 → 脏标记保护，不覆盖在途草稿（D1/F13 竞态）。
    const input2 = screen.getByLabelText('默认下载路径') as HTMLInputElement;
    fireEvent.change(input2, { target: { value: 'C:/Users/u/Ongoing' } });
    mocks.systemDefaultDownloadPath = 'C:/Users/u/Late';
    rerender(
      <TCopyProvider t={{} as unknown as CopyDict} locale="en-US">
        <BrowserDownloadPathSection />
      </TCopyProvider>,
    );
    expect((screen.getByLabelText('默认下载路径') as HTMLInputElement).value).toBe(
      'C:/Users/u/Ongoing',
    );
  });

  it('enable-migrate confirm button matches cancel (secondary, no brand blue)', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('download-migrate-checkbox'));
    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: '确认开启' });
    expect(confirmBtn.className).toContain('adl-btn--secondary');
    expect(confirmBtn.className).not.toContain('adl-btn--primary');
  });
});
