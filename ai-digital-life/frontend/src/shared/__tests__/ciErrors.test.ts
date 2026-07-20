import { describe, expect, it } from 'vitest';
import { CI_ERROR_CODES, resolveCiErrorMessage, resolveCiFolderName } from '../ciErrors';

describe('resolveCiErrorMessage', () => {
  const t = {
    ciConfigMissingRepo: '请先配置仓库 owner 和 repo',
    ciFetchStatusFailed: '获取 CI 状态失败',
    ciDefaultFolderName: '目录 {index}',
  };

  it('translates CONFIG_MISSING_REPO error code to i18n text', () => {
    expect(resolveCiErrorMessage(CI_ERROR_CODES.CONFIG_MISSING_REPO, t)).toBe(
      t.ciConfigMissingRepo,
    );
  });

  it('translates FETCH_STATUS_FAILED error code to i18n text', () => {
    expect(resolveCiErrorMessage(CI_ERROR_CODES.FETCH_STATUS_FAILED, t)).toBe(
      t.ciFetchStatusFailed,
    );
  });

  it('returns original message for unknown error codes (e.g. backend raw error)', () => {
    expect(resolveCiErrorMessage('bridge not ready', t)).toBe('bridge not ready');
  });

  it('returns null when message is null', () => {
    expect(resolveCiErrorMessage(null, t)).toBeNull();
  });

  it('returns null when message is empty string (falsy)', () => {
    expect(resolveCiErrorMessage('', t)).toBeNull();
  });
});

describe('resolveCiFolderName', () => {
  const t = {
    ciConfigMissingRepo: '请先配置仓库 owner 和 repo',
    ciFetchStatusFailed: '获取 CI 状态失败',
    ciDefaultFolderName: '目录 {index}',
  };

  it('translates default folder placeholder with numeric index', () => {
    expect(resolveCiFolderName(`${CI_ERROR_CODES.DEFAULT_FOLDER_NAME}:5`, t)).toBe('目录 5');
  });

  it('translates default folder placeholder with index 0 (boundary)', () => {
    expect(resolveCiFolderName(`${CI_ERROR_CODES.DEFAULT_FOLDER_NAME}:0`, t)).toBe('目录 0');
  });

  it('translates default folder placeholder with empty index to template with trailing space', () => {
    // empty index → template.replace('{index}', '') → '目录 '
    expect(resolveCiFolderName(`${CI_ERROR_CODES.DEFAULT_FOLDER_NAME}:`, t)).toBe('目录 ');
  });

  it('returns plain folder name unchanged', () => {
    expect(resolveCiFolderName('我的文件夹', t)).toBe('我的文件夹');
  });

  it('returns empty string unchanged', () => {
    expect(resolveCiFolderName('', t)).toBe('');
  });

  it('returns name with non-numeric index unchanged when not matching placeholder prefix', () => {
    // String that contains the prefix substring but does not start with it
    expect(resolveCiFolderName(`prefix-${CI_ERROR_CODES.DEFAULT_FOLDER_NAME}:5`, t)).toBe(
      `prefix-${CI_ERROR_CODES.DEFAULT_FOLDER_NAME}:5`,
    );
  });

  it('falls back to neutral placeholder when ciDefaultFolderName i18n key is missing', () => {
    // Bug scenario: t without ciDefaultFolderName → fallback reconstructs original name
    // (neutral identifier, no hardcoded natural-language text)
    const incompleteT = {
      ciConfigMissingRepo: 'x',
      ciFetchStatusFailed: 'y',
    } as Record<string, string>;
    expect(resolveCiFolderName(`${CI_ERROR_CODES.DEFAULT_FOLDER_NAME}:5`, incompleteT)).toBe(
      `${CI_ERROR_CODES.DEFAULT_FOLDER_NAME}:5`,
    );
  });
});
