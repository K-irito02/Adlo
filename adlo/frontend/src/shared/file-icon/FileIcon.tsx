import React, { useMemo } from 'react';
import { FileIcon as ReactSymbolsFileIcon } from '@react-symbols/icons/utils';
import { FileIcon as ReactFileIcon, defaultStyles } from 'react-file-icon';
import type { DefaultExtensionType } from 'react-file-icon';
import type { IconSize } from '@icons/helper';
import { FALLBACK_EXTENSION_MAP, IconFallbackConfig, IconFallbackUnknown } from './fallbackIcons';

interface FileIconProps {
  fileName: string;
  size?: IconSize;
  className?: string;
}

function extractExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) {
    return '';
  }
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * Dotfile rule — `.editorconfig`, `.gitignore`, `.prettierignore`, `.env` …
 *
 * These names have no real extension: `extractExtension()` returns '' because
 * the only dot is the leading one, so the extension-driven tiers never see them.
 * Before this rule they all fell through to the generic unknown icon (the old
 * special-filename table mapped `.gitignore` to react-file-icon's `config`, which
 * is not a valid `defaultStyles` key, so it never rendered); now the whole
 * single-dot dotfile family shares the project config glyph.
 *
 * Dotfiles carrying a second dot (`.eslintrc.json`, `.env.local`) are left to the
 * extension-driven tiers, so they keep their extension icon — `.eslintrc.json`
 * gets the library JSON icon, while `.env.local` currently falls back to that
 * library's generic document (no `local` icon exists there).
 */
function isDotfile(fileName: string): boolean {
  return fileName.startsWith('.') && !fileName.slice(1).includes('.');
}

/**
 * Soft color overrides for react-file-icon.
 * Background: #e8e8e8 (light gray, less bright than whitesmoke)
 * Glyph: #666666 (medium gray, more visible)
 * Gradient: reduced opacity for less glare
 */
const SOFT_GLYPH_COLOR = '#666666';
const SOFT_GRADIENT_OPACITY = 0.1;

/**
 * Extensions where react-file-icon has better/more recognizable icons
 * (office documents with colored backgrounds and type glyphs).
 * For these extensions, prefer react-file-icon over react-symbols.
 */
const REACT_FILE_ICON_PREFERRED = new Set([
  'doc',
  'docx',
  'odt',
  'rtf', // Word documents
  'xls',
  'xlsx',
  'ods',
  'csv', // Spreadsheets
  'ppt',
  'pptx',
  'odp', // Presentations
  'pdf', // PDF
  'key', // Keynote
  'pages', // Pages
  'numbers', // Numbers
]);

/**
 * Unified file icon resolver.
 *
 * Resolution priority (per user requirement):
 * 1. react-file-icon for office documents (strongest for doc/xls/ppt types)
 * 2. Project config glyph for dotfiles without a real extension (.editorconfig, .gitignore …)
 * 3. Project SVGs for niche/cold extensions (hta, conf, jsonc …)
 * 4. react-symbols for everything else (300+ icons — programming, images, media, config)
 * 5. Generic document for names without a usable extension (LICENSE, Dockerfile, Makefile …)
 */
export function FileIcon({ fileName, size = 16, className }: FileIconProps) {
  const extension = useMemo(() => extractExtension(fileName), [fileName]);

  // Tier 1: react-file-icon — office documents (strongest for doc/xls/ppt)
  // Label text is hidden (no extension prop) — icons are too small for text
  // Soft glyph color + reduced gradient for less bright appearance
  if (extension && REACT_FILE_ICON_PREFERRED.has(extension)) {
    const hasStyle = extension in defaultStyles;
    if (hasStyle) {
      const baseStyle = defaultStyles[extension as DefaultExtensionType];
      const mergedStyle = {
        ...baseStyle,
        glyphColor: baseStyle.glyphColor || SOFT_GLYPH_COLOR,
        gradientOpacity: baseStyle.gradientOpacity ?? SOFT_GRADIENT_OPACITY,
      };
      return (
        <span
          className={className}
          style={{ display: 'inline-flex', alignItems: 'center', width: size, height: size }}
        >
          <ReactFileIcon {...mergedStyle} />
        </span>
      );
    }
  }

  // Tier 2: dotfiles — no real extension, give them the config glyph instead of
  // the generic document (also covers .gitignore / .gitattributes, which used to
  // fall through to the generic unknown icon)
  if (isDotfile(fileName)) {
    return <IconFallbackConfig size={size} className={className} decorative />;
  }

  // Tier 3: Project icons for niche/cold extensions (hta, conf, jsonc …).
  // Must run before react-symbols: that library renders a generic document for
  // any unknown extension, so a lookup placed after it would never be reached.
  const ProjectIcon = FALLBACK_EXTENSION_MAP[extension];
  if (ProjectIcon) {
    return <ProjectIcon size={size} className={className} decorative />;
  }

  // Tier 4: react-symbols — broadest coverage (300+ icons)
  if (extension) {
    return (
      <ReactSymbolsFileIcon fileName={fileName} width={size} height={size} className={className} />
    );
  }

  // Tier 5: names without a usable extension (LICENSE, Dockerfile, Makefile …).
  // The old special-filename table mapped Dockerfile / Makefile to `docker` /
  // `config`, which are not valid `defaultStyles` keys, so it never rendered
  // beyond this same document — the dead layer was removed.
  return <IconFallbackUnknown size={size} className={className} decorative />;
}
