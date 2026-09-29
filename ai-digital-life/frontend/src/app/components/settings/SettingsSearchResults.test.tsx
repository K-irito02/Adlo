import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { CopyDict } from '@i18n';
import { SettingsSearchResults } from './SettingsSearchResults';
import type { SettingsSearchEntry } from './settingsSearchIndex';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

const entries: SettingsSearchEntry[] = [
  { group: 'general', anchorId: 'language', label: 'Language' },
  { group: 'storage', anchorId: 'treeCache', label: 'Tree cache' },
];

// 分组/点击用例传空查询：highlightMatch 原样返回文本，断言针对纯 label 文本。
function renderResults(onSelect = vi.fn(), query = '') {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <SettingsSearchResults entries={entries} query={query} onSelect={onSelect} />
    </TCopyProvider>,
  );
}

describe('SettingsSearchResults', () => {
  it('按组分组渲染：组标题取自 SETTINGS_GROUPS，条目按组归属', () => {
    const { container } = renderResults();
    const groups = Array.from(container.querySelectorAll('.adl-settings-search-results__group'));
    expect(groups).toHaveLength(2);
    // 组顺序依 SETTINGS_GROUPS：general 在 storage 之前。
    expect(groups[0].textContent).toContain('settingsGeneral');
    expect(groups[1].textContent).toContain('storageTitle');
    expect(screen.getByText('Language')).not.toBeNull();
    expect(screen.getByText('Tree cache')).not.toBeNull();
  });

  it('点击结果行回传对应 entry', () => {
    const onSelect = vi.fn();
    renderResults(onSelect);
    fireEvent.click(screen.getByRole('button', { name: 'Tree cache' }));
    expect(onSelect).toHaveBeenCalledWith(entries[1]);
  });

  it('命中词经共享 highlightMatch 高亮（mark.adl-settings-highlight）', () => {
    renderResults(vi.fn(), 'a');
    const marks = document.querySelectorAll('mark.adl-settings-highlight');
    expect(marks.length).toBeGreaterThan(0);
  });

  it('空结果渲染共享空状态（role=status）', () => {
    render(
      <TCopyProvider t={mockT} locale="en-US">
        <SettingsSearchResults entries={[]} query="zzz" onSelect={vi.fn()} />
      </TCopyProvider>,
    );
    expect(screen.getByRole('status')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('settingsNoResults');
  });

  describe('命中行补显', () => {
    const blockEntries: SettingsSearchEntry[] = [
      {
        group: 'storage',
        anchorId: 'corePaths',
        label: 'Core paths',
        details: [
          { text: 'Clipboard data', locate: 'Clipboard' },
          { text: 'what it relates to', locate: 'Clipboard' },
        ],
      },
    ];

    function renderBlock(query: string) {
      return render(
        <TCopyProvider t={mockT} locale="en-US">
          <SettingsSearchResults entries={blockEntries} query={query} onSelect={vi.fn()} />
        </TCopyProvider>,
      );
    }

    it('块主标题未命中、命中行文案时补显该行文案并高亮命中词', () => {
      const { container } = renderBlock('clipboard');
      const detail = container.querySelector('.adl-settings-search-results__detail');
      expect(detail?.textContent).toBe('Clipboard data');
      expect(detail?.querySelector('mark.adl-settings-highlight')?.textContent).toBe('Clipboard');
      // 标题未命中：不做标记高亮，原样显示。
      expect(container.querySelector('.adl-settings-search-results__label')?.textContent).toBe(
        'Core paths',
      );
    });

    it('块主标题自身命中时不补显（标题已高亮命中词，再补一行是冗余）', () => {
      const { container } = renderBlock('core');
      expect(container.querySelector('.adl-settings-search-results__detail')).toBeNull();
      expect(container.querySelector('.adl-settings-search-results__label mark')?.textContent).toBe(
        'Core',
      );
    });

    it('只补显首个命中的行文案（不做多行堆叠）', () => {
      const { container } = renderBlock('relates');
      const details = container.querySelectorAll('.adl-settings-search-results__detail');
      expect(details).toHaveLength(1);
      expect(details[0].textContent).toBe('what it relates to');
    });
  });
});
