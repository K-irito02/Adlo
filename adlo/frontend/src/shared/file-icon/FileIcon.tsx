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
 * Special filename rules — maps well-known filenames to react-file-icon
 * extension keys so they get the correct glyph (e.g., Dockerfile → "docker",
 * package.json → "config"). Used as fallback when extension-based resolution misses.
 */
const SPECIAL_FILENAME_RULES: Record<string, string> = {
  dockerfile: 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker',
  makefile: 'config',
  'pnpm-workspace.yaml': 'config',
  'turbo.json': 'config',
  'cargo.toml': 'config',
  'cargo.lock': 'config',
  'composer.json': 'config',
  'composer.lock': 'config',
  gemfile: 'config',
  'gemfile.lock': 'config',
  podfile: 'config',
  'podfile.lock': 'config',
  'requirements.txt': 'config',
  pipfile: 'config',
  'pipfile.lock': 'config',
  'pyproject.toml': 'config',
  'poetry.lock': 'config',
  'go.mod': 'config',
  'go.sum': 'config',
  'package-lock.json': 'config',
  'pnpm-lock.yaml': 'config',
  'yarn.lock': 'config',
};

/** Check if a filename starts with a prefix (for .env, .eslintrc, etc.) */
const SPECIAL_PREFIX_RULES: { prefix: string; type: string }[] = [
  { prefix: '.env', type: 'config' },
  { prefix: '.eslintrc', type: 'config' },
  { prefix: 'eslint.', type: 'config' },
  { prefix: 'prettier.', type: 'config' },
  { prefix: '.prettierrc', type: 'config' },
  { prefix: 'tsconfig', type: 'config' },
  { prefix: 'vite.config.', type: 'config' },
  { prefix: 'vitest.config.', type: 'config' },
  { prefix: 'jest.config.', type: 'config' },
  { prefix: 'rollup.config.', type: 'config' },
  { prefix: 'webpack.config.', type: 'config' },
  { prefix: 'readme.', type: 'document' },
];

function getSpecialFilenameType(fileName: string): string | undefined {
  const lower = fileName.toLowerCase();

  // Exact match
  if (SPECIAL_FILENAME_RULES[lower]) {
    return SPECIAL_FILENAME_RULES[lower];
  }

  // Prefix match
  for (const { prefix, type } of SPECIAL_PREFIX_RULES) {
    if (lower === prefix || lower.startsWith(prefix)) {
      return type;
    }
  }

  return undefined;
}

/**
 * Dotfile rule — `.editorconfig`, `.gitignore`, `.prettierignore`, `.env` …
 *
 * These names have no real extension: `extractExtension()` returns '' because
 * the only dot is the leading one, which used to drop them into the generic
 * document fallback. Dotfiles that carry a real extension (`.eslintrc.json`,
 * `.env.local`) keep the extension-driven icon instead.
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
 * 5. Special filename rules (Dockerfile, package.json, etc.)
 * 6. Generic unknown file icon
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
  // fall through to react-file-icon's config style)
  if (isDotfile(fileName)) {
    return <IconFallbackConfig size={size} className={className} decorative />;
  }

  // Tier 3: Project icons for niche/cold extensions (hta, conf, jsonc …).
  // Must run before react-symbols: that library renders a generic document for
  // any unknown extension, so a lookup placed after it would never be reached.
  if (extension) {
    const FallbackIcon = FALLBACK_EXTENSION_MAP[extension];
    if (FallbackIcon) {
      return <FallbackIcon size={size} className={className} decorative />;
    }
  }

  // Tier 4: react-symbols — broadest coverage (300+ icons)
  if (extension) {
    return (
      <ReactSymbolsFileIcon fileName={fileName} width={size} height={size} className={className} />
    );
  }

  // Tier 5: Special filename rules (Dockerfile, package.json, etc.)
  // Apply soft glyph color + reduced gradient
  const specialType = getSpecialFilenameType(fileName);
  if (specialType) {
    const hasSpecialStyle = specialType in defaultStyles;
    if (hasSpecialStyle) {
      const baseStyle = defaultStyles[specialType as DefaultExtensionType];
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
          <ReactFileIcon extension={specialType} {...mergedStyle} />
        </span>
      );
    }
  }

  // Tier 6: Generic unknown file icon
  return <IconFallbackUnknown size={size} className={className} decorative />;
}
