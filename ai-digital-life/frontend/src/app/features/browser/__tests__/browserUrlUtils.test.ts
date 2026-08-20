import { describe, it, expect } from 'vitest';
import { normalizeUrlForCompare } from '../browserUrlUtils';

describe('normalizeUrlForCompare modal_id', () => {
  it('treats base and modal_id variants as equal', () => {
    expect(normalizeUrlForCompare('https://a.com/search/music?type=general')).toBe(
      normalizeUrlForCompare('https://a.com/search/music?modal_id=123&type=general'),
    );
  });
  it('removes trailing ? when modal_id is the only query param', () => {
    expect(normalizeUrlForCompare('https://a.com/p?modal_id=123')).toBe('https://a.com/p');
  });
  it('leaves urls without modal_id unchanged', () => {
    expect(normalizeUrlForCompare('https://a.com/p?a=1&b=2')).toBe('https://a.com/p?a=1&b=2');
  });
});
