import assert from 'node:assert/strict';
import test from 'node:test';
import { i18nTestScopes } from './i18n-test-scope.mjs';

test('harnessVersion dictionary fans out to all three feature areas plus settings', () => {
  assert.deepEqual(i18nTestScopes(['src/app/i18n/zh-CN/harnessVersion.ts']), [
    'src/app/components/settings',
    'src/app/features/dsh',
    'src/app/features/harness',
    'src/app/features/opencode',
    'src/app/i18n/__tests__',
  ]);
});

test('dsh dictionary scopes to dsh + harness (+ settings/i18n tests)', () => {
  assert.deepEqual(i18nTestScopes(['src/app/i18n/en-US/dsh.ts']), [
    'src/app/components/settings',
    'src/app/features/dsh',
    'src/app/features/harness',
    'src/app/i18n/__tests__',
  ]);
});

test('multiple known dictionaries merge their scopes', () => {
  const scopes = i18nTestScopes(['src/app/i18n/zh-CN/dsh.ts', 'src/app/i18n/en-US/opencode.ts']);
  assert.deepEqual(scopes, [
    'src/app/components/settings',
    'src/app/features/dsh',
    'src/app/features/harness',
    'src/app/features/opencode',
    'src/app/i18n/__tests__',
  ]);
});

test('unknown dictionaries fall back to null (caller keeps vitest related)', () => {
  assert.equal(i18nTestScopes(['src/app/i18n/zh-CN/common.ts']), null);
  assert.equal(i18nTestScopes(['src/app/i18n/zh-CN/dsh.ts', 'src/app/i18n/zh-CN/common.ts']), null);
});

test('no files yields null', () => {
  assert.equal(i18nTestScopes([]), null);
});
