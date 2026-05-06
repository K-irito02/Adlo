export const DEFAULT_INLINE_MINIMAP_WIDTH = 84;
export const INLINE_MINIMAP_GUTTER_WIDTH = 8;
export const INLINE_MINIMAP_MAX_COLUMN = 80;

type InlineMinimapRailWidthInput = {
  configuredWidth?: number | null;
  minimapCharWidth?: number | null;
  longestLineColumn?: number | null;
  gutterWidth?: number;
  maxColumn?: number;
};

export function getLongestLineColumn(content: string): number {
  if (!content) {
    return 0;
  }

  let longest = 0;
  let current = 0;

  for (let index = 0; index < content.length; index += 1) {
    const codePoint = content.charCodeAt(index);
    if (codePoint === 13) {
      continue;
    }
    if (codePoint === 10) {
      longest = Math.max(longest, current);
      current = 0;
      continue;
    }
    current += 1;
  }

  return Math.max(longest, current);
}

export function computeInlineMinimapRailWidth(input: InlineMinimapRailWidthInput): number {
  const configuredWidth = Math.ceil(input.configuredWidth ?? DEFAULT_INLINE_MINIMAP_WIDTH);
  if (configuredWidth <= 0) {
    return DEFAULT_INLINE_MINIMAP_WIDTH;
  }

  const minimapCharWidth = input.minimapCharWidth ?? 0;
  const longestLineColumn = Math.max(0, Math.floor(input.longestLineColumn ?? 0));
  if (!(minimapCharWidth > 0) || longestLineColumn <= 0) {
    return configuredWidth;
  }

  const gutterWidth = Math.max(0, input.gutterWidth ?? INLINE_MINIMAP_GUTTER_WIDTH);
  const maxColumn = Math.max(1, Math.floor(input.maxColumn ?? INLINE_MINIMAP_MAX_COLUMN));
  const visibleColumns = Math.min(longestLineColumn, maxColumn);
  const occupiedWidth = Math.ceil(gutterWidth + visibleColumns * minimapCharWidth);
  const minimumUsableWidth = Math.ceil(gutterWidth + minimapCharWidth);

  return Math.min(configuredWidth, Math.max(minimumUsableWidth, occupiedWidth));
}
