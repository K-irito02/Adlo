import { describe, expect, it } from 'vitest';
import { buildReswitchedSearch } from '../searchEngineReswitch';
import type { SearchEngine } from '@stores/slices/browserSearchEnginesSlice';

const baidu: SearchEngine = {
  id: '百度',
  name: '百度',
  urlTemplate: 'https://www.baidu.com/s?wd=%s',
  isBuiltIn: true,
  isDefault: true,
};

const bing: SearchEngine = {
  id: 'bing',
  name: 'Bing',
  urlTemplate: 'https://www.bing.com/search?q=%s',
  isBuiltIn: true,
  isDefault: false,
};

const engines = [baidu, bing];

describe('buildReswitchedSearch', () => {
  it('re-runs the same query on the newly selected engine', () => {
    const result = buildReswitchedSearch(
      'https://www.baidu.com/s?wd=%E4%BD%A0%E5%A5%BD',
      engines,
      bing,
    );
    expect(result).toEqual({
      url: 'https://www.bing.com/search?q=%E4%BD%A0%E5%A5%BD',
      query: '你好',
      title: 'Bing: 你好',
    });
  });

  it('returns null for a normal page so the caller leaves it untouched', () => {
    expect(buildReswitchedSearch('https://example.com/article', engines, bing)).toBeNull();
  });

  it('returns null when the current URL belongs to an unknown engine', () => {
    expect(buildReswitchedSearch('https://unknown.example/search?q=hi', engines, bing)).toBeNull();
  });

  it('keeps percent signs and literal %20 in the query', () => {
    const percent = buildReswitchedSearch('https://www.baidu.com/s?wd=50%25%20off', engines, bing);
    expect(percent?.query).toBe('50% off');
    expect(percent?.url).toBe('https://www.bing.com/search?q=50%25%20off');

    const literal = buildReswitchedSearch('https://www.baidu.com/s?wd=a%2520b', engines, bing);
    expect(literal?.query).toBe('a%20b');
    expect(literal?.url).toBe('https://www.bing.com/search?q=a%2520b');
  });
});
