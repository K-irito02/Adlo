import React, { useMemo } from 'react';
import {
  DefaultFileIcon,
  FileIcon as ReactSymbolsFileIcon,
  getIconForFile,
} from '@react-symbols/icons/utils';
import { FileIcon as ReactFileIcon, defaultStyles } from 'react-file-icon';
import type { DefaultExtensionType } from 'react-file-icon';
import type { IconSize } from '@icons/helper';
import { FALLBACK_EXTENSION_MAP, IconFallbackConfig, IconFallbackUnknown } from './fallbackIcons';
import { REACT_FILE_ICON_PREFERRED } from './iconMapping';

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
 * Single-dot dotfiles resolve to react-symbols' dedicated name icons when the
 * library ships one (Tier 2), and to the project config glyph otherwise.
 *
 * Dotfiles carrying a second dot (`.eslintrc.json`, `.env.local`) stay on the
 * extension-driven tiers, but those tiers enable `autoAssign` for dot names so the
 * family stays consistent: `.eslintrc.json` gets the ESLint icon like `.eslintrc`,
 * `.env.local` gets the `.env` icon, and only names the library does not know fall
 * back to the plain extension icon.
 */
function isDotfile(fileName: string): boolean {
  return fileName.startsWith('.') && !fileName.slice(1).includes('.');
}

/**
 * `Object.prototype` 的成员名（`constructor` / `toString` / `__proto__` …）不是合法
 * 扩展名，但 `obj[extension]` 的普通索引会沿原型链取到它们；react-symbols 内部同样
 * 直接索引，会把函数/对象当成组件渲染并抛错。
 *
 * 扩展名在 `extractExtension()` 里已统一小写，故这里按小写形态比较；用集合而非
 * `in` 是因为属性名是驼峰（`toString` / `valueOf`），小写后的名字在原型上并不存在。
 */
const PROTOTYPE_MEMBER_NAMES = new Set(
  Object.getOwnPropertyNames(Object.prototype).map((name) => name.toLowerCase()),
);

function isPrototypeMember(name: string): boolean {
  return PROTOTYPE_MEMBER_NAMES.has(name.toLowerCase());
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
 * Unified file icon resolver.
 *
 * Resolution priority (per user requirement):
 * 1. react-file-icon for office documents (strongest for doc/xls/ppt types)
 * 2. react-symbols name icons for dotfiles; project config glyph when it has none
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

  // Tier 2: dotfiles — prefer react-symbols' built-in name icons (`.gitignore`,
  // `.editorconfig`, `.prettierignore` …) because the library ships dedicated
  // symbols for them; fall back to the project config glyph only for dotfiles the
  // library does not know, so unknown dotfiles still read as "configuration".
  // `.constructor` / `.__proto__` must skip the library: after the name lookup
  // misses, it re-indexes by the trailing segment as an extension (`.constructor`
  // → `constructor`), which walks Object.prototype and crashes.
  if (isDotfile(fileName)) {
    if (!isPrototypeMember(fileName.slice(1))) {
      const libraryIcon = getIconForFile({
        fileName,
        autoAssign: true,
        width: size,
        height: size,
        className,
      });
      if (libraryIcon.type !== DefaultFileIcon) {
        return libraryIcon;
      }
    }
    return <IconFallbackConfig size={size} className={className} decorative />;
  }

  // Tier 3: Project icons for niche/cold extensions (hta, conf, jsonc …).
  // Must run before react-symbols: that library renders a generic document for
  // any unknown extension, so a lookup placed after it would never be reached.
  // `Object.hasOwn` 而非直接索引：`a.constructor` / `a.__proto__` 这类扩展名会沿原型链
  // 取到 Object.prototype 的成员，被当成组件渲染并抛错。
  const ProjectIcon = Object.hasOwn(FALLBACK_EXTENSION_MAP, extension)
    ? FALLBACK_EXTENSION_MAP[extension]
    : undefined;
  if (ProjectIcon) {
    return <ProjectIcon size={size} className={className} decorative />;
  }

  // Tier 4: react-symbols — broadest coverage (300+ icons). Dotfile names keep
  // `autoAssign` so the family stays consistent with Tier 2 (`.eslintrc.json` →
  // ESLint, `.env.local` → `.env`); other names keep the extension-only lookup.
  if (extension && !isPrototypeMember(extension)) {
    return (
      <ReactSymbolsFileIcon
        fileName={fileName}
        autoAssign={fileName.startsWith('.')}
        width={size}
        height={size}
        className={className}
      />
    );
  }

  // Tier 5: names without a usable extension (LICENSE, Dockerfile, Makefile …).
  // The old special-filename table mapped Dockerfile / Makefile to `docker` /
  // `config`, which are not valid `defaultStyles` keys, so it never rendered
  // beyond this same document — the dead layer was removed.
  return <IconFallbackUnknown size={size} className={className} decorative />;
}
