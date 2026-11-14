import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { defaultStyles } from 'react-file-icon';
import type { DefaultExtensionType } from 'react-file-icon';
import { FileIcon } from '../FileIcon';
import { FALLBACK_EXTENSION_MAP } from '../fallbackIcons';
import { REACT_FILE_ICON_PREFERRED } from '../iconMapping';

/**
 * 映射契约：凡是「把某个 ASCII 键映射到第三方图标库」的表，值必须在库里真实存在。
 *
 * 事故背景（2026-11-14）：已删除的 `SPECIAL_FILENAME_RULES` 把 Dockerfile / package.json
 * 映射到 react-file-icon 的 `docker` / `config`，而这两个都不是 `defaultStyles` 的键，
 * 于是整层配置「查得到、渲染不出」，长期没人发现；同一轮还发现 `REACT_FILE_ICON_PREFERRED`
 * 里的 `key` / `pages` / `numbers` 也缺 glyph。这里直接遍历源数据，新增一条死映射就会红。
 */

describe('file icon mapping contracts', () => {
  it('every preferred office extension exists in react-file-icon defaultStyles', () => {
    const missing = [...REACT_FILE_ICON_PREFERRED].filter(
      (extension) => !(extension in defaultStyles),
    );
    expect(missing).toEqual([]);
  });

  it.each([...REACT_FILE_ICON_PREFERRED])(
    'renders the react-file-icon wrapper for office extension .%s',
    (extension) => {
      const { container } = render(<FileIcon fileName={`report.${extension}`} />);
      // Tier 1 用 inline-flex span 包裹库图标；缺键会静默落到 react-symbols（无该 span）。
      const wrapper = container.querySelector('span[style*="inline-flex"]');
      expect(wrapper).toBeTruthy();
      expect(wrapper?.querySelector('svg')).toBeTruthy();
      expect(defaultStyles[extension as DefaultExtensionType]).toBeTruthy();
    },
  );

  it.each(Object.keys(FALLBACK_EXTENSION_MAP))('renders the project glyph for .%s', (extension) => {
    const { container } = render(<FileIcon fileName={`legacy.${extension}`} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(container.querySelectorAll('svg path').length).toBeGreaterThanOrEqual(2);
  });
});
