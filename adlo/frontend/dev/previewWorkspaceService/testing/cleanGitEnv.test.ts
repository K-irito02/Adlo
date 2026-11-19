// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sanitizeGitEnvForTest } from './cleanGitEnv';

const REPO_LOCATION_ENV_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
];

function snapshotEnv(keys: string[]): Map<string, string | undefined> {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Map<string, string | undefined>): void {
  for (const [key, value] of snapshot) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('sanitizeGitEnvForTest', () => {
  it('strips repo-selection variables, reports them and keeps unrelated ones', () => {
    const snapshot = snapshotEnv([...REPO_LOCATION_ENV_KEYS, 'GIT_TERMINAL_PROMPT']);
    try {
      for (const key of REPO_LOCATION_ENV_KEYS) {
        process.env[key] = `probe-${key}`;
      }
      process.env.GIT_TERMINAL_PROMPT = '0';

      const removed = sanitizeGitEnvForTest();

      expect(removed.sort()).toEqual([...REPO_LOCATION_ENV_KEYS].sort());
      for (const key of REPO_LOCATION_ENV_KEYS) {
        expect(process.env[key]).toBeUndefined();
      }
      expect(process.env.GIT_TERMINAL_PROMPT).toBe('0');
    } finally {
      restoreEnv(snapshot);
    }
  });

  it('is a no-op when the variables are already absent', () => {
    const snapshot = snapshotEnv(REPO_LOCATION_ENV_KEYS);
    try {
      for (const key of REPO_LOCATION_ENV_KEYS) {
        delete process.env[key];
      }
      expect(sanitizeGitEnvForTest()).toEqual([]);
    } finally {
      restoreEnv(snapshot);
    }
  });
});
