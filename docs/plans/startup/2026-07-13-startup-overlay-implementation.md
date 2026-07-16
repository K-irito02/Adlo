# StartupOverlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a startup loading overlay with FlowFieldBackground + "Kora/可燃" SVG stroke-draw animation that blocks mouse events until bootstrap Phase 2 completes.

**Architecture:** Fixed full-screen overlay (`z-9999`) wraps FlowFieldBackground + centered SVG text. Store gains `appReady` signal set at end of bootstrap(). Theme read from `data-theme` attribute, language from `navigator.language`. Overlay fades via AnimatePresence.

**Tech Stack:** React 19, TypeScript, motion, Zustand, SVG

## Global Constraints

- No new external dependencies (use existing `motion` library)
- All files follow existing code style (no comments, no `any`, const preferred)
- Overlay must block ALL pointer events (move/hover/click) from reaching app content
- Theme detection: `document.documentElement.dataset.theme` + `matchMedia('(prefers-color-scheme: dark)')` fallback
- Language detection: `navigator.language.startsWith('zh')` → "可燃", else "Kora"
- Dismiss: AnimatePresence fade-out 500ms on `appReady`

---
### Task 1: Add `appReady` to store

**Files:**
- Modify: `frontend/src/app/stores/StoreState.ts`
- Modify: `frontend/src/app/stores/slices/workspaceSlice.ts`
- Modify: `frontend/src/app/stores/actions/generalActions.ts`

**Interfaces:**
- Produces: `StoreState.appReady: boolean` (initial `false`), set to `true` at end of `bootstrap()`

- [ ] **Step 1: Add `appReady` to StoreState interface**

Edit `frontend/src/app/stores/StoreState.ts`. After `loading: boolean;`, add:
```typescript
  appReady: boolean;
```

- [ ] **Step 2: Add `appReady` to workspaceSlice initial state**

Edit `frontend/src/app/stores/slices/workspaceSlice.ts`. Find the initial state object passed to `createWorkspaceSlice` and add `appReady: false` alongside `loading: true`.

- [ ] **Step 3: Set `appReady: true` at end of bootstrap Phase 2**

Edit `frontend/src/app/stores/actions/generalActions.ts`.

In `bootstrap()`, at the `set({ ...nextState, ...patchResult stuff })` call around line 91, add `appReady: true` to the object.

At the no-workspace `set({ ... })` call around line 148, also add `appReady: true`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no new errors (pre-existing errors only).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/stores/StoreState.ts frontend/src/app/stores/slices/workspaceSlice.ts frontend/src/app/stores/actions/generalActions.ts
git commit -m "feat(store): add appReady signal set at bootstrap completion"
```

---
### Task 2: Extend FlowFieldBackground with theme-aware props

**Files:**
- Modify: `frontend/src/app/components/flow-field-background.tsx`

**Interfaces:**
- Produces: Updated `FlowFieldBackgroundProps` with `trailColor?: string` and `containerClass?: string`

- [ ] **Step 1: Add new props to the interface**

Edit `flow-field-background.tsx`. Add to `FlowFieldBackgroundProps`:
```typescript
  trailColor?: string;
  containerClass?: string;
```

- [ ] **Step 2: Update defaults**

Change the component parameters:
```typescript
export default function FlowFieldBackground({
  className = '',
  color = '#6366f1',
  trailOpacity = 0.15,
  particleCount = 600,
  speed = 1,
  trailColor = '0, 0, 0',
  containerClass = 'bg-black',
}: FlowFieldBackgroundProps) {
```

- [ ] **Step 3: Update trail fill to use trailColor**

Replace:
```typescript
ctx.fillStyle = `rgba(0, 0, 0, ${trailOpacity})`;
```
With:
```typescript
ctx.fillStyle = `rgba(${trailColor}, ${trailOpacity})`;
```

- [ ] **Step 4: Update container className to use containerClass**

Replace:
```typescript
className={`relative w-full h-full bg-black overflow-hidden${className ? ` ${className}` : ''}`}
```
With:
```typescript
className={`relative w-full h-full ${containerClass} overflow-hidden${className ? ` ${className}` : ''}`}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/flow-field-background.tsx
git commit -m "feat: add trailColor and containerClass props to FlowFieldBackground"
```

---
### Task 3: Create StartupOverlay component

**Files:**
- Create: `frontend/src/app/components/StartupOverlay.tsx`

**Interfaces:**
- Produces: `<StartupOverlay />` — no props, reads theme/language internally

- [ ] **Step 1: Write the component**

Create `frontend/src/app/components/StartupOverlay.tsx`:

```typescript
import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import FlowFieldBackground from './flow-field-background';

type ResolvedTheme = 'light' | 'dark';

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function getThemeFromRoot(): ResolvedTheme {
  if (typeof document !== 'undefined') {
    const t = document.documentElement.dataset.theme;
    if (t === 'dark' || t === 'light') return t;
  }
  return getSystemTheme();
}

function getDisplayText(): string {
  if (typeof navigator !== 'undefined' && navigator.language.startsWith('zh')) {
    return '可燃';
  }
  return 'Kora';
}

const THEME_COLORS: Record<ResolvedTheme, { bg: string; trail: string; particle: string; stroke: string }> = {
  dark: { bg: 'bg-black', trail: '0, 0, 0', particle: '#818cf8', stroke: '#c7d2fe' },
  light: { bg: 'bg-white', trail: '255, 255, 255', particle: '#4f46e5', stroke: '#3730a3' },
};

export default function StartupOverlay() {
  const [theme, setTheme] = useState<ResolvedTheme>(getThemeFromRoot);
  const displayText = useMemo(getDisplayText, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setTheme(getThemeFromRoot());
    mq.addEventListener('change', handleChange);

    const observer = new MutationObserver(() => {
      setTheme(getThemeFromRoot());
    });
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });

    return () => {
      mq.removeEventListener('change', handleChange);
      observer.disconnect();
    };
  }, []);

  const colors = THEME_COLORS[theme];

  return (
    <div className="fixed inset-0 z-9999">
      <FlowFieldBackground
        particleCount={600}
        color={colors.particle}
        trailOpacity={0.15}
        trailColor={colors.trail}
        speed={1}
        containerClass={colors.bg}
      />
      <div className="absolute inset-0 flex items-center justify-center select-none">
        <svg viewBox="0 0 500 120" className="w-80 max-w-[80vw]" aria-hidden="true">
          <motion.text
            x="250"
            y="60"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="80"
            fontWeight="900"
            fontFamily="system-ui, sans-serif"
            fill="none"
            stroke={colors.stroke}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={5000}
            initial={{ strokeDashoffset: 5000 }}
            animate={{ strokeDashoffset: [5000, 0, -5000] }}
            transition={{
              duration: 3,
              ease: [0.42, 0, 0.58, 1],
              repeat: Infinity,
            }}
          >
            {displayText}
          </motion.text>
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/StartupOverlay.tsx
git commit -m "feat: add StartupOverlay with theme-aware SVG stroke animation"
```

---
### Task 4: Integrate StartupOverlay into App.tsx

**Files:**
- Modify: `frontend/src/app/App.tsx`

**Interfaces:**
- Consumes: `StoreState.appReady`, `<StartupOverlay />`

- [ ] **Step 1: Add import and store read**

In `App.tsx`, add the import:
```typescript
import { AnimatePresence, motion } from 'motion/react';
import StartupOverlay from './components/StartupOverlay';
```

After all existing `useAppStore` reads, add:
```typescript
const appReady = useAppStore((s) => s.appReady);
```

- [ ] **Step 2: Add overlay to render**

After the closing `</TCopyProvider>` tag (or after the `</>` fragment in the no-t branch), add:
```typescript
      <AnimatePresence>
        {!appReady && (
          <motion.div
            key="startup-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <StartupOverlay />
          </motion.div>
        )}
      </AnimatePresence>
```

Place this at the very end of the return statement, inside the outermost fragment, after the last `{...}` expression.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/App.tsx
git commit -m "feat: integrate StartupOverlay into App, dismiss on appReady"
```

---
### Task 5: Verify and lint

**Files:** All modified files

- [ ] **Step 1: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 2: Run ESLint**

```bash
cd frontend && npx eslint .
```
Expected: 0 errors (pre-existing warnings allowed).

- [ ] **Step 3: Run format check**

```bash
cd frontend && npx prettier --check "src/**/*.{ts,tsx}"
```

- [ ] **Step 4: Verify no regression on existing tests**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -5
```
Expected: all tests pass (same count as before).

- [ ] **Step 5: Final commit if lint/tests fixed anything**

```bash
git add -A
git commit -m "chore: fix lint/format after StartupOverlay changes"
```
