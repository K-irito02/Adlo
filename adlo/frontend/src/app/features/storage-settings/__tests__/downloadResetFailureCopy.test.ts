import { describe, it, expect } from 'vitest';
import { zhCN } from '@i18n/zh-CN/index';
import { enUS } from '@i18n/en-US/index';
import { downloadResetFailureCopy } from '../downloadPathReset';

describe('downloadResetFailureCopy — blocked migration', () => {
  it.each([
    ['zh', zhCN, zhCN.storageDownloadMigrateBlockedActive],
    ['en', enUS, enUS.storageDownloadMigrateBlockedActive],
  ] as const)(
    '%s maps downloads_active to the dedicated blocked toast',
    (_locale, dict, expected) => {
      expect(
        downloadResetFailureCopy(
          dict,
          'downloadPath',
          { code: 'Internal', message: 'downloads_active' },
          true,
        ),
      ).toBe(expected);
    },
  );

  it('keeps the generic migrate-failure copy for other path errors', () => {
    expect(
      downloadResetFailureCopy(zhCN, 'downloadPath', { code: 'Internal', message: 'boom' }, true),
    ).toBe('迁移文件失败：boom');
  });
});
