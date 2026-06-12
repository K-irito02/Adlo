import React from 'react';
import { IconGlobe } from '../../icons';

export function SearchResultItem({
  item,
  onClick,
}: {
  item: { title: string; url: string; source?: string };
  onClick: () => void;
}) {
  return (
    <div
      className="adl-browser-search-result-item"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onClick();
        }
      }}
    >
      <IconGlobe size={14} decorative className="adl-browser-search-result-item__icon" />
      <div className="adl-browser-search-result-item__content">
        <div className="adl-browser-search-result-item__title">{item.title}</div>
        <div className="adl-browser-search-result-item__url">{item.url}</div>
      </div>
      {item.source && <div className="adl-browser-search-result-item__source">{item.source}</div>}
    </div>
  );
}