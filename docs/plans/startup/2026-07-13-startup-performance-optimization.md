# Startup Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Tauri desktop app startup time from ~2s to ~1.2s by removing ~1.3MB of unnecessary JS from Vite `modulepreload` and ~85KB of unused i18n data from main bundle.

**Architecture:** Three independent optimizations: (1) convert static imports of heavy vendors (`pdfjs-dist` 400KB, `mammoth` 485KB) inside lazy-loaded components to dynamic `await import()`, preventing Vite from adding them to modulepreload; (2) split i18n locales into separate chunks loaded on-demand. Each change is independently testable via `npx tsc --noEmit` and `npx vite build`.

**Tech Stack:** Vite/rolldown bundler, TypeScript, React.lazy, dynamic `import()`

## Global Constraints

- All optimizations must preserve 100% existing functionality (no visual/behavioral changes)
- Follow existing code patterns in the file being modified
- Must pass `npx tsc --noEmit` with zero new errors
- Must produce a successful `npx vite build` with bundle size reduction verifiable via dist output
- No new dependencies

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `frontend/src/app/features/preview/PdfPreview.tsx` | Modify | Convert static `import * as pdfjsLib` to dynamic `await import()` inside component |
| `frontend/src/app/features/preview/DocxPreview.tsx` | Modify | Convert static `import mammoth` to dynamic `await import()` inside component |
| `frontend/src/app/i18n/types.ts` | Modify | Remove static imports of both locales; replace with type-only import |
| `frontend/src/app/i18n/i18nLoader.ts` | Create | Async function `loadLocale(locale: Locale): Promise<CopyDict>` |
| `frontend/src/app/hooks/useAppStartup.ts` | Modify | Use `loadLocale()` instead of static `copy` object |
| `frontend/src/app/App.tsx` | Modify | Wire locale loading; pass `t`/`locale` only after load |
| `frontend/src/app/regions/TitleBar.tsx` (possible) | Modify | Update locale selection handler |

---

### Task 1: Dynamic import pdfjs-dist in PdfPreview

**Files:**
- Modify: `frontend/src/app/features/preview/PdfPreview.tsx` (lines 1-8, 22-63)
- Verify: no visual regression via manual test

**Interfaces:**
- Consumes: `PdfPreviewProps` (unchanged)
- Produces: Same `PdfPreview` component, same props interface

**Problem:** Line 2 has `import * as pdfjsLib from 'pdfjs-dist'` (400KB bundle). `PdfPreview` is lazy-loaded via `React.lazy(() => import('./PdfPreview'))` in `LazyPreviews.tsx`, but Vite detects the static import chain and adds `vendor-pdf` to modulepreload on every page load.

**Solution:** Replace the top-level static import with an inline dynamic import inside the `useEffect` where `pdfjsLib` is first used.

- [ ] **Step 1: Modify PdfPreview.tsx — remove static import, add dynamic import**

Change lines 1-8 from:
```tsx
import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useTCopy } from '@i18n/useTCopy';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
```

To:
```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type * as PdfJsType from 'pdfjs-dist';
```

- [ ] **Step 2: Update the useEffect to use dynamic import**

Change the `renderPage` function (lines 22-63) from:
```tsx
  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      try {
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        // ...
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      } catch (err) {
        // ...
      }
    }
```

To:
```tsx
  useEffect(() => {
    let cancelled = false;
    let pdfjs: typeof PdfJsType;

    async function initPdfjs() {
      if (!pdfjs) {
        pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      }
    }

    async function renderPage() {
      try {
        await initPdfjs();
        const pdf = await pdfjs!.getDocument({ data }).promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);
        const page = await pdf.getPage(currentPage);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    renderPage();
    return () => {
      cancelled = true;
    };
  }, [data, currentPage]);
```

Note: The `pdfjs!` non-null assertion is safe because `initPdfjs()` always completes before `getDocument` is called.

- [ ] **Step 3: Run TypeScript check**

```powershell
cd frontend && npx tsc --noEmit 2>&1 | Select-String "PdfPreview"
```
Expected: no output (zero errors for PdfPreview)

- [ ] **Step 4: Verify build output**

```powershell
cd frontend && npx vite build 2>&1 | Select-String "vendor-pdf"
```
Expected: `vendor-pdf` chunk still exists (since pdfjs-dist IS still bundled into the lazy chunk) but is NO LONGER in `modulepreload` in `dist/index.html`.

```powershell
Select-String "vendor-pdf" -Path frontend/dist/index/html -SimpleMatch
```
Expected: No match (vendor-pdf removed from modulepreload)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/preview/PdfPreview.tsx
git commit -m "perf: dynamic import pdfjs-dist in PdfPreview to remove 400KB from modulepreload"
```

---

### Task 2: Dynamic import mammoth in DocxPreview

**Files:**
- Modify: `frontend/src/app/features/preview/DocxPreview.tsx` (lines 1-3, 15-27)

**Interfaces:**
- Consumes: `DocxPreviewProps` (unchanged)
- Produces: Same `DocxPreview` component, same props interface

**Problem:** Line 2 has `import mammoth from 'mammoth'` (485KB bundle). Same lazy-load pattern as PdfPreview triggers Vite `modulepreload`.

- [ ] **Step 1: Modify DocxPreview.tsx — remove static import**

Change from:
```tsx
import React, { useEffect, useState } from 'react';
import mammoth from 'mammoth';
import { useTCopy } from '@i18n/useTCopy';
```

To:
```tsx
import React, { useEffect, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
```

- [ ] **Step 2: Update useEffect to use dynamic import**

Change the `useEffect` (lines 15-27) from:
```tsx
  useEffect(() => {
    mammoth
      .convertToHtml({ arrayBuffer: data })
      .then((result) => {
        setHtml(result.value);
        if (result.messages.length > 0) {
          /* DOCX conversion warnings */
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [data]);
```

To:
```tsx
  useEffect(() => {
    let cancelled = false;

    async function convertDocx() {
      try {
        const mammoth = await import('mammoth');
        if (cancelled) return;
        const result = await mammoth.default.convertToHtml({ arrayBuffer: data });
        if (cancelled) return;
        setHtml(result.value);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    convertDocx();
    return () => {
      cancelled = true;
    };
  }, [data]);
```

- [ ] **Step 3: Run TypeScript check**

```powershell
cd frontend && npx tsc --noEmit 2>&1 | Select-String "DocxPreview"
```
Expected: no output (zero errors)

- [ ] **Step 4: Verify build output**

```powershell
Select-String "vendor-mammoth" -Path frontend/dist/index.html -SimpleMatch
```
Expected: No match (mammoth removed from modulepreload)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/preview/DocxPreview.tsx
git commit -m "perf: dynamic import mammoth in DocxPreview to remove 485KB from modulepreload"
```

---

### Task 3: Split i18n locales into on-demand chunks

**Files:**
- Create: `frontend/src/app/i18n/i18nLoader.ts`
- Modify: `frontend/src/app/i18n/types.ts`
- Modify: `frontend/src/app/i18n/index.ts`
- Modify: `frontend/src/app/hooks/useAppStartup.ts`

**Interfaces:**
- Consumes: `Locale` type from `types.ts`
- Produces: `loadLocale(locale: Locale): Promise<CopyDict>` — async function that dynamically imports the correct locale module

**Key insight:** The `copy` runtime object is ONLY used in `useAppStartup.ts`. All other files import just `type { CopyDict }` or `type { CopyKey }` (type-only = zero runtime cost). No consumers need updating beyond `useAppStartup.ts`.

- [ ] **Step 1: Check locale export pattern**

```powershell
Get-Content "frontend/src/app/i18n/zh-CN/index.ts" -First 3
Get-Content "frontend/src/app/i18n/en-US/index.ts" -First 3
```
Expected to see `export const zhCN` / `export const enUS`.

- [ ] **Step 2: Create i18nLoader.ts**

Create `frontend/src/app/i18n/i18nLoader.ts`:

```typescript
import type { CopyDict, Locale } from './types';

export async function loadLocale(locale: Locale): Promise<CopyDict> {
  if (locale === 'zh-CN') {
    const m = await import('./zh-CN/index');
    return m.zhCN;
  }
  const m = await import('./en-US/index');
  return m.enUS;
}
```

- [ ] **Step 3: Modify types.ts — remove static locale imports**

Change from:
```typescript
import { zhCN } from './zh-CN/index';
import { enUS } from './en-US/index';

export type CopyKey = keyof typeof zhCN;
export type CopyDict = Record<CopyKey, string>;
export type Locale = 'zh-CN' | 'en-US';

export const copy = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const;
```

To:
```typescript
export type Locale = 'zh-CN' | 'en-US';
export type CopyDict = Record<string, string>;
export type CopyKey = string;
```

Note: `CopyKey` changes from `keyof typeof zhCN` to `string`. This loosens type safety slightly but all existing consumers use `import type { CopyDict }` for runtime access and `import type { CopyKey }` only for type annotations. No runtime behavior changes.

- [ ] **Step 4: Update index.ts — remove `copy` re-export**

Change from:
```typescript
export type { CopyKey, CopyDict, Locale } from './types';
export { copy } from './types';
export { copyToClipboard, copyMultiple } from './copyToClipboard';
export { formatNewFolderName, formatNewFolderNameByLocale } from './format';
export { getAppCopy } from './getAppCopy';
export { TCopyProvider, type TCopyContextValue } from './TCopyContext';
export { useTCopy } from './useTCopy';
export { formatT } from './formatT';
```

To:
```typescript
export type { CopyKey, CopyDict, Locale } from './types';
export { copyToClipboard, copyMultiple } from './copyToClipboard';
export { formatNewFolderName, formatNewFolderNameByLocale } from './format';
export { getAppCopy } from './getAppCopy';
export { TCopyProvider, type TCopyContextValue } from './TCopyContext';
export { useTCopy } from './useTCopy';
export { formatT } from './formatT';
```

- [ ] **Step 5: Update useAppStartup.ts — load locale asynchronously**

Change from:
```typescript
import { useEffect } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import { copy, type Locale } from '../i18n';
import { useAppActions } from './useAppActions';
import { useThemeSync } from './useThemeSync';
import { useTaskCenterPolling } from './useTaskCenterPolling';

export function useAppStartup(appInfo: AppInfo | undefined) {
  const actions = useAppActions();

  useThemeSync(appInfo);
  useTaskCenterPolling(appInfo);

  const locale = (appInfo?.config.language ?? 'zh-CN') as Locale;
  const t = copy[locale];

  useEffect(() => {
    void window.digitalLife.window.setTitle(t.brandHoverName);
  }, [t.brandHoverName]);

  useEffect(() => {
    void actions.bootstrap();
  }, [actions, actions.bootstrap]);
```

To:
```typescript
import { useEffect, useState } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import type { CopyDict, Locale } from '../i18n/types';
import { loadLocale } from '../i18n/i18nLoader';
import { useAppActions } from './useAppActions';
import { useThemeSync } from './useThemeSync';
import { useTaskCenterPolling } from './useTaskCenterPolling';

export function useAppStartup(appInfo: AppInfo | undefined) {
  const actions = useAppActions();
  const [t, setT] = useState<CopyDict | undefined>(undefined);
  const [locale, setLocale] = useState<Locale>('zh-CN');

  useThemeSync(appInfo);
  useTaskCenterPolling(appInfo);

  useEffect(() => {
    if (!appInfo) return;
    const lang = (appInfo.config.language ?? 'zh-CN') as Locale;
    setLocale(lang);
    loadLocale(lang).then(setT);
  }, [appInfo]);

  useEffect(() => {
    if (!t) return;
    void window.digitalLife.window.setTitle(t['brandHoverName']);
  }, [t]);

  useEffect(() => {
    if (!t) return;
    void actions.bootstrap();
  }, [t, actions, actions.bootstrap]);

  // Wait until locale data loads before returning, so App.tsx doesn't render without translations
  return {
    locale: t ? locale : undefined,
    t,
  };
}

```

- [ ] **Step 6: Handle undefined t in App.tsx**

In `frontend/src/app/App.tsx`, the `useAppStartup` return type has changed. Locate the destructuring:

```typescript
const { locale, t } = useAppStartup(appInfo);
```

Change this to:

```typescript
const { locale, t } = useAppStartup(appInfo);

// Block rendering until i18n data is loaded (prevents flash of untranslated text)
if (!t) {
  return <div className="adl-shell adl-ide" />;
}
```

- [ ] **Step 7: Run TypeScript check**

```powershell
cd frontend && npx tsc --noEmit 2>&1 | Select-String "error"
```
Expected: zero errors from our changed files

- [ ] **Step 8: Verify build output**

Build the project and check that locale chunks are separate:
```powershell
cd frontend && npx vite build
Get-ChildItem frontend/dist/assets/ | Where-Object { $_.Name -match 'zh-CN|en-US' }
```
Expected: Two new chunk files (e.g., `zh-CN-xxx.js` and `en-US-xxx.js`) that are NOT in `modulepreload` in `dist/index.html`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/i18n/i18nLoader.ts frontend/src/app/i18n/types.ts frontend/src/app/i18n/index.ts frontend/src/app/hooks/useAppStartup.ts frontend/src/app/App.tsx
git commit -m "perf: split i18n locales into on-demand chunks, remove 85KB from main bundle"
```

---

## Verification

After all tasks complete, verify:

1. **TypeScript**: `cd frontend && npx tsc --noEmit` — zero errors
2. **Build**: `cd frontend && npx vite build` — succeeds
3. **Bundle analysis**: Compare `frontend/dist/index.html` modulepreload count before/after
4. **Functional**: Launch app, verify:
   - UI renders correctly in both locales
   - PDF preview works (navigate to a file that opens PdfPreview)
   - DOCX preview works (navigate to a .docx file)
   - Language switching works via TitleBar settings
5. **Runtime**: Check browser DevTools Network tab — pdfjs-dist and mammoth chunks should NOT be loaded until the user actually opens a PDF/DOCX preview

## Rollback

Each task is independently revertible via `git checkout` on the modified files. If a particular optimization causes issues, revert that single task's files and commit.
