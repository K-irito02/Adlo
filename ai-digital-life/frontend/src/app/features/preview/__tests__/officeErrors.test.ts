import { describe, expect, it } from 'vitest';
import { isZipUnpackError } from '../officeErrors';

describe('isZipUnpackError', () => {
  it('matches JSZip central-directory failures', () => {
    expect(isZipUnpackError("Can't find end of central directory : is this a zip file ?")).toBe(
      true,
    );
  });

  it('matches generic not-a-zip and invalid-zip messages', () => {
    expect(isZipUnpackError('not a zip file')).toBe(true);
    expect(isZipUnpackError('invalid zip file')).toBe(true);
    expect(isZipUnpackError('bad zip archive')).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isZipUnpackError('broken pipe')).toBe(false);
    expect(isZipUnpackError('unsupported version')).toBe(false);
    expect(isZipUnpackError('')).toBe(false);
  });
});
