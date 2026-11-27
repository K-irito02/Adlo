import { describe, it, expect } from 'vitest';
import { settingsZh } from '@i18n/zh-CN/settings';
import { settingsEn } from '@i18n/en-US/settings';

/** 开启迁移的说明/确认只承诺 tracked-only；关闭/仅开关恢复明确不搬文件。 */
const trackedKeys = [
  'storageDownloadMigrateHint',
  'storageDownloadMigrateEnableConfirm',
  'storageDownloadResetConfirmMigrateOn',
  // 组级恢复清单/说明同属下载迁移文案，不能残留整目录搬运/删除旧目录的承诺。
  'storageGroupResetItemDownloadMigrateOn',
  'browserGroupResetMigrateOnNote',
] as const;
const noMoveKeys = [
  'storageDownloadResetConfirmMigrateOff',
  'storageDownloadResetConfirmSwitchOnly',
] as const;
const shortKeys = [
  'storageDownloadMigrateEnableTitle',
  'storageDownloadMigrateEnableConfirmBtn',
] as const;

describe('download migration settings copy', () => {
  it.each(trackedKeys)('zh %s is tracked-only and keeps untracked files', (key) => {
    const copy = settingsZh[key];
    expect(copy).toContain('仅迁移下载记录中的文件');
    expect(copy).toContain('其它文件保留');
    expect(copy).not.toContain('全部文件');
    expect(copy).not.toContain('删除旧');
  });

  it.each(trackedKeys)('en %s is tracked-only and keeps untracked files', (key) => {
    const copy = settingsEn[key];
    expect(copy).toMatch(/recorded in downloads/i);
    expect(copy).toMatch(/other files in the old folder are kept/i);
    expect(copy).not.toMatch(/every file/i);
    expect(copy).not.toMatch(/deletes? the old folder/i);
  });

  it.each(noMoveKeys)('zh %s moves nothing and keeps untracked files', (key) => {
    const copy = settingsZh[key];
    expect(copy).toContain('其它文件保留');
    expect(copy).toMatch(/不迁移|不涉及文件搬运/);
    expect(copy).not.toContain('全部文件');
    expect(copy).not.toContain('删除旧');
  });

  it.each(noMoveKeys)('en %s moves nothing and keeps untracked files', (key) => {
    const copy = settingsEn[key];
    expect(copy).toMatch(/no files are moved/i);
    expect(copy).toMatch(/other files in the old folder are kept/i);
    expect(copy).not.toMatch(/every file/i);
    expect(copy).not.toMatch(/deletes? the old folder/i);
  });

  it.each(shortKeys)('zh %s does not promise whole-folder migration', (key) => {
    const copy = settingsZh[key];
    expect(copy).toContain('记录');
    expect(copy).not.toContain('全部文件');
    expect(copy).not.toContain('删除旧');
  });

  it.each(shortKeys)('en %s does not promise whole-folder migration', (key) => {
    const copy = settingsEn[key];
    expect(copy).toMatch(/record/i);
    expect(copy).not.toMatch(/every file/i);
    expect(copy).not.toMatch(/deletes? the old folder/i);
  });

  it('exposes blocked/result/failure keys in both locales with matching placeholders', () => {
    const keys = [
      'storageDownloadMigrateBlockedActive',
      'storageDownloadMigrateResult',
      'storageDownloadMigrateFailed',
    ] as const;
    for (const key of keys) {
      expect(settingsZh[key]).toBeTruthy();
      expect(settingsEn[key]).toBeTruthy();
    }
    expect(settingsZh.storageDownloadMigrateBlockedActive).toContain('有正在下载或暂停的任务');
    expect(settingsEn.storageDownloadMigrateBlockedActive).toMatch(/active or paused/i);
    for (const dict of [settingsZh, settingsEn]) {
      expect(dict.storageDownloadMigrateResult).toContain('{migrated}');
      expect(dict.storageDownloadMigrateResult).toContain('{missing}');
      expect(dict.storageDownloadMigrateFailed).toContain('{error}');
    }
  });
});
