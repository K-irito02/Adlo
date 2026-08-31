import React, { useMemo } from 'react';
import { FileIcon as ReactSymbolsFileIcon } from '@react-symbols/icons/utils';
import {
  FileIcon as ReactFileIcon,
  defaultStyles,
  type DefaultExtensionType,
} from 'react-file-icon';
import { type IconSize } from '@icons/helper';
import { FALLBACK_EXTENSION_MAP, IconFallbackUnknown } from './DownloadFileFallbackIcons';

interface DownloadFileIconProps {
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
 * Unified file icon resolver for download items.
 *
 * Resolution priority:
 * 1. Project fallback SVGs (niche/cold extensions: hta, pif, scr, wsf, com, conf, jsonc)
 * 2. react-file-icon (office documents: docx, pptx, xlsx, csv, rtf, etc.)
 * 3. react-symbols (programming, images, audio/video, database, config — 300+ icons)
 * 4. Generic unknown file icon (completely unmatched)
 */
export function DownloadFileIcon({ fileName, size = 16, className }: DownloadFileIconProps) {
  const extension = useMemo(() => extractExtension(fileName), [fileName]);

  if (!extension) {
    return <IconFallbackUnknown size={size} className={className} decorative />;
  }

  // Tier 1: Project fallback — cold/niche extensions
  const FallbackIcon = FALLBACK_EXTENSION_MAP[extension];
  if (FallbackIcon) {
    return <FallbackIcon size={size} className={className} decorative />;
  }

  // Tier 2: react-file-icon — office documents and other themed extensions
  const hasReactFileIconStyle = extension in defaultStyles;
  if (hasReactFileIconStyle) {
    return (
      <span
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', width: size, height: size }}
      >
        <ReactFileIcon
          extension={extension}
          {...defaultStyles[extension as DefaultExtensionType]}
        />
      </span>
    );
  }

  // Tier 3: react-symbols — broadest coverage (programming, images, media, etc.)
  // Falls back to its own DefaultFileIcon for truly unknown extensions
  return (
    <ReactSymbolsFileIcon fileName={fileName} width={size} height={size} className={className} />
  );
}
