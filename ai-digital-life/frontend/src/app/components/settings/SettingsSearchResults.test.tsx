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
});
