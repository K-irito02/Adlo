import { useState, useEffect } from 'react';
import { getFaviconUrl, getGoogleFaviconUrl } from '../utils/favicon';
import { subscribeFavicon } from '../utils/fetchPageMeta';
import { IconLink, type IconSize } from '../icons';

interface BrowserFaviconProps {
  url: string;
  size?: IconSize;
}

export function BrowserFavicon({ url, size = 14 }: BrowserFaviconProps) {
  const [faviconUrl, setFaviconUrl] = useState<string>(() => (url ? getFaviconUrl(url) : ''));

  useEffect(() => {
    setFaviconUrl(url ? getFaviconUrl(url) : '');
    if (!url) {
      return;
    }
    const unsubscribe = subscribeFavicon(url, () => {
      setFaviconUrl(getFaviconUrl(url));
    });
    return unsubscribe;
  }, [url]);

  return (
    <span
      className={`adl-filetree__file-icon ${faviconUrl ? 'adl-filetree__file-icon--favicon' : 'adl-filetree__file-icon--default'}`}
    >
      {faviconUrl && (
        <img
          src={faviconUrl}
          alt=""
          className="adl-browser-tree__favicon"
          style={{ width: size, height: size }}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            if (!img.src.includes('google.com/s2/favicons')) {
              const fallback = getGoogleFaviconUrl(url);
              if (fallback) {
                img.src = fallback;
                return;
              }
            }
            img.style.display = 'none';
            const parent = img.parentElement;
            if (parent) {
              parent.classList.remove('adl-filetree__file-icon--favicon');
              parent.classList.add('adl-filetree__file-icon--default');
              const link = parent.querySelector('.adl-browser-tree__link-fallback');
              if (link) {
                (link as HTMLElement).style.display = 'inline-flex';
              }
            }
          }}
          onLoad={(e) => {
            const parent = (e.target as HTMLImageElement).parentElement;
            if (parent) {
              const link = parent.querySelector('.adl-browser-tree__link-fallback');
              if (link) {
                (link as HTMLElement).style.display = 'none';
              }
            }
          }}
        />
      )}
      <IconLink
        size={size}
        decorative
        className="adl-browser-tree__link-fallback"
        style={faviconUrl ? { display: 'none' } : undefined}
      />
    </span>
  );
}
