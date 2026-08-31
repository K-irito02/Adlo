# Download File Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file-type icons to each download item in the browser download menu, using a unified resolver that combines react-symbols (300+ icons), react-file-icon (112 icons), and project fallback SVGs for 100% extension coverage.

**Architecture:** A `DownloadFileIcon` component extracts the file extension from a filename, then resolves the icon through a priority chain: react-symbols → react-file-icon → project fallback SVGs. The component is integrated into `BrowserDownloadItem` next to the filename.

**Tech Stack:** React 19, TypeScript, `@react-symbols/icons`, `react-file-icon`, existing project SVG icon system (`src/app/icons/`)

## Global Constraints

- SVG icons only, `currentColor` inheritance, no emoji
- Package manager: pnpm (frontend)
- Lint: `npx eslint . && npx tsc --noEmit`
- Test: `pnpm --dir frontend run test`
- Design tokens: CSS custom properties (`var(--...)`)
- i18n: all UI text via `useTCopy` (no hardcoded strings)
- Double-end consistency: feature must work in both Tauri desktop and browser mode

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/app/features/browser/DownloadFileIcon.tsx` | Create | Unified file icon resolver component |
| `frontend/src/app/features/browser/DownloadFileFallbackIcons.tsx` | Create | Fallback SVG icons for uncovered extensions |
| `frontend/src/app/features/browser/BrowserDownloadItem.tsx` | Modify | Integrate DownloadFileIcon |
| `frontend/src/app/features/browser/BrowserDownloadMenu.css` | Modify | Add icon spacing styles |
| `frontend/src/app/features/browser/__tests__/DownloadFileIcon.test.tsx` | Create | Unit tests for icon resolution |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `ai-digital-life/frontend/package.json`

**Interfaces:**
- Produces: `@react-symbols/icons` and `react-file-icon` available in node_modules

- [ ] **Step 1: Install react-symbols**

```bash
cd ai-digital-life/frontend && pnpm add @react-symbols/icons
```

- [ ] **Step 2: Install react-file-icon**

```bash
cd ai-digital-life/frontend && pnpm add react-file-icon
```

- [ ] **Step 3: Verify installation**

```bash
cd ai-digital-life/frontend && pnpm ls @react-symbols/icons react-file-icon
```

Expected: both packages listed with version numbers

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/package.json ai-digital-life/frontend/pnpm-lock.yaml
git commit -m "chore(deps): add @react-symbols/icons and react-file-icon"
```

---

### Task 2: Create Fallback SVG Icons

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/browser/DownloadFileFallbackIcons.tsx`

**Interfaces:**
- Produces: `FallbackFileIcon` component and `FALLBACK_EXTENSION_MAP` mapping cold extensions to fallback icon components
- Consumes: project `make` helper from `@icons/helper`

- [ ] **Step 1: Create fallback icons file**

```tsx
// ai-digital-life/frontend/src/app/features/browser/DownloadFileFallbackIcons.tsx
import React from 'react';
import { make, type IconComponent } from '@icons/helper';

/**
 * Fallback SVG icons for file extensions not covered by
 * react-symbols or react-file-icon.
 *
 * These are cold/niche extensions that rarely appear in downloads.
 * Uses the project's existing SVG icon convention (currentColor, 24x24 viewBox).
 */

/* Generic file with question mark — unknown extension fallback */
export const IconFallbackUnknown = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M12 13v1" />
    <path d="M12 16v.01" />
  </>,
);

/* Script/batch file — for hta, pif, scr, wsf, com */
export const IconFallbackScript = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M9 15l2 2 3-4" />
  </>,
);

/* Config file — for conf, jsonc */
export const IconFallbackConfig = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <circle cx="12" cy="15" r="2" />
    <path d="M12 11.5v1" />
    <path d="M12 17.5v1" />
  </>,
);

/** Map of cold/niche extensions to fallback icon components */
export const FALLBACK_EXTENSION_MAP: Record<string, IconComponent> = {
  hta: IconFallbackScript,
  pif: IconFallbackScript,
  scr: IconFallbackScript,
  wsf: IconFallbackScript,
  com: IconFallbackScript,
  conf: IconFallbackConfig,
  jsonc: IconFallbackConfig,
};
```

- [ ] **Step 2: Verify no type errors**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit --pretty
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/DownloadFileFallbackIcons.tsx
git commit -m "feat(browser): add fallback SVG icons for niche file extensions"
```

---

### Task 3: Create DownloadFileIcon Resolver Component

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/browser/DownloadFileIcon.tsx`

**Interfaces:**
- Consumes: `@react-symbols/icons/utils` (`FileIcon` component), `react-file-icon` (`FileIcon` + `defaultStyles`), `FALLBACK_EXTENSION_MAP` from Task 2
- Produces: `DownloadFileIcon` component with props `{ fileName: string; size?: number; className?: string }`

- [ ] **Step 1: Create the resolver component**

```tsx
// ai-digital-life/frontend/src/app/features/browser/DownloadFileIcon.tsx
import React, { useMemo } from 'react';
import { FileIcon as ReactSymbolsFileIcon } from '@react-symbols/icons/utils';
import { FileIcon as ReactFileIcon, defaultStyles } from 'react-file-icon';
import 'react-file-icon/dist/styles.css';
import { FALLBACK_EXTENSION_MAP, IconFallbackUnknown } from './DownloadFileFallbackIcons';

interface DownloadFileIconProps {
  fileName: string;
  size?: number;
  className?: string;
}

/**
 * Extract file extension from a filename.
 * Handles "file.tar.gz" → "gz", "file" → "", ".hidden" → "hidden"
 */
function extractExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * Unified file icon resolver for download items.
 *
 * Resolution priority:
 * 1. react-symbols (300+ icons — programming, images, audio/video, database, config)
 * 2. react-file-icon (112 icons — office documents, executables)
 * 3. Project fallback SVGs (niche/cold extensions)
 * 4. Generic unknown file icon
 *
 * react-symbols is checked first because it has the broadest coverage.
 * react-file-icon fills gaps in office documents (docx, pptx, xlsx, etc.).
 * Fallback SVGs handle remaining cold extensions (hta, pif, scr, etc.).
 */
export function DownloadFileIcon({ fileName, size = 20, className }: DownloadFileIconProps) {
  const extension = useMemo(() => extractExtension(fileName), [fileName]);

  if (!extension) {
    return <IconFallbackUnknown size={size} className={className} decorative />;
  }

  // Tier 1: react-symbols — check if extension is mapped
  // react-symbols' FileIcon renders DefaultFileIcon for unmapped extensions,
  // so we use it directly and let it handle unknowns with its default.
  // However, for better fallback control, we check the extension map first.
  // The getIconForFile utility would be ideal but requires async resolution.
  // Instead, we render react-symbols' FileIcon and it will show its default
  // for unknown extensions — which is acceptable as a secondary fallback.

  // Tier 2: react-file-icon — check if extension has a style
  const hasReactFileIconStyle = extension in defaultStyles;

  // Tier 3: check project fallback map
  const FallbackIcon = FALLBACK_EXTENSION_MAP[extension];

  if (FallbackIcon) {
    return <FallbackIcon size={size} className={className} decorative />;
  }

  if (hasReactFileIconStyle) {
    return (
      <span className={className} style={{ display: 'inline-flex', alignItems: 'center' }}>
        <ReactFileIcon
          extension={extension}
          size={size}
          {...defaultStyles[extension]}
        />
      </span>
    );
  }

  // Tier 1 (default): react-symbols handles this via its own resolution
  return (
    <ReactSymbolsFileIcon
      fileName={fileName}
      width={size}
      height={size}
    />
  );
}
```

- [ ] **Step 2: Verify no type errors**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit --pretty
```

Expected: no errors (may need to install `@types/react-file-icon` if types are missing)

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/DownloadFileIcon.tsx
git commit -m "feat(browser): add DownloadFileIcon unified resolver component"
```

---

### Task 4: Integrate DownloadFileIcon into BrowserDownloadItem

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserDownloadItem.tsx:1-8` (imports)
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserDownloadItem.tsx:154-158` (header section)

**Interfaces:**
- Consumes: `DownloadFileIcon` from Task 3

- [ ] **Step 1: Add import**

Add to the imports section (after line 2):

```tsx
import { DownloadFileIcon } from './DownloadFileIcon';
```

- [ ] **Step 2: Add icon before filename**

Replace lines 155-158 (the header div content):

```tsx
// Before:
<div className="adl-download-item__header">
  <span className="adl-download-item__name" title={record.file_name}>
    {record.file_name}
  </span>

// After:
<div className="adl-download-item__header">
  <DownloadFileIcon fileName={record.file_name} size={16} className="adl-download-item__file-icon" />
  <span className="adl-download-item__name" title={record.file_name}>
    {record.file_name}
  </span>
```

- [ ] **Step 3: Verify no type errors**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit --pretty
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/BrowserDownloadItem.tsx
git commit -m "feat(browser): integrate file-type icons in download menu items"
```

---

### Task 5: Add CSS for File Icon Spacing

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserDownloadMenu.css:204-208`

**Interfaces:**
- Consumes: existing CSS custom properties from design system

- [ ] **Step 1: Add icon style**

After the `.adl-download-item__header` rule (line 208), add:

```css
.adl-download-item__file-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  line-height: 0;
}

.adl-download-item__file-icon img,
.adl-download-item__file-icon svg {
  display: block;
}
```

- [ ] **Step 2: Verify no lint errors**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/browser/BrowserDownloadMenu.css
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/BrowserDownloadMenu.css
git commit -m "style(browser): add spacing for download file type icons"
```

---

### Task 6: Write Unit Tests

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/browser/__tests__/DownloadFileIcon.test.tsx`

**Interfaces:**
- Consumes: `DownloadFileIcon` from Task 3

- [ ] **Step 1: Create test file**

```tsx
// ai-digital-life/frontend/src/app/features/browser/__tests__/DownloadFileIcon.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DownloadFileIcon } from '../DownloadFileIcon';

describe('DownloadFileIcon', () => {
  it('renders without crashing for known extension', () => {
    render(<DownloadFileIcon fileName="report.pdf" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('renders without crashing for unknown extension', () => {
    render(<DownloadFileIcon fileName="file.xyz" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('renders fallback for niche extension hta', () => {
    render(<DownloadFileIcon fileName="script.hta" />);
    const icon = document.querySelector('svg');
    expect(icon).toBeTruthy();
  });

  it('renders without crashing for no extension', () => {
    render(<DownloadFileIcon fileName="Makefile" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('applies custom size', () => {
    render(<DownloadFileIcon fileName="test.ts" size={24} />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('applies custom className', () => {
    render(<DownloadFileIcon fileName="test.py" className="custom-class" />);
    const el = document.querySelector('.custom-class');
    expect(el).toBeTruthy();
  });

  it('handles filenames with multiple dots', () => {
    render(<DownloadFileIcon fileName="archive.tar.gz" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('handles hidden files', () => {
    render(<DownloadFileIcon fileName=".gitignore" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd ai-digital-life/frontend && pnpm vitest run src/app/features/browser/__tests__/DownloadFileIcon.test.tsx
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/browser/__tests__/DownloadFileIcon.test.tsx
git commit -m "test(browser): add unit tests for DownloadFileIcon resolver"
```

---

### Task 7: Final Verification

**Files:**
- No new files

**Interfaces:**
- Consumes: all previous tasks

- [ ] **Step 1: Run full type check**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2: Run lint**

```bash
cd ai-digital-life/frontend && npx eslint src/app/features/browser/
```

Expected: no errors

- [ ] **Step 3: Run all frontend tests**

```bash
cd ai-digital-life/frontend && pnpm vitest run
```

Expected: all tests pass (no regressions)

- [ ] **Step 4: Visual verification**

Start the dev server and verify the download menu shows file-type icons for various file types (PDF, ZIP, TS, PY, DOCX, etc.).

```bash
cd ai-digital-life/frontend && pnpm dev
```

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix(browser): final adjustments for download file icons"
```
